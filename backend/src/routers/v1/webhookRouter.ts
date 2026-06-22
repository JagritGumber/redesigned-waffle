import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { and, eq } from "drizzle-orm";
import {
  civitaiFiles,
  civitaiModelInstalls,
  generatorJobs,
  generatorPrompts,
  InsertGeneratorJob,
  InsertGeneratorPrompt,
} from "@/schema";
import { updateStorageInfo } from "@/utils/updateStorageInfo";
import { InfoParsedResult } from "@/types/generator";
import { resolveModelImageWebhookState } from "@/services/modelImageStatusService";
import {
  isModelImageRebuildConfigured,
  triggerModelImageBuild,
} from "@/services/modelImageBuildService";
import { ModelTypes } from "@/types/models";

type RunPodWebhookPayload = {
  id: string; // RunPod Job ID
  status: string; // RunPod job status (COMPLETED, FAILED, RUNNING, etc.)
  input?: {
    job_type?: "generate_image" | "generate_prompt";
  };
  output?: {
    images: string[]; // Base64 images with no prefix, need to add data:image/png;base64, prefix
    info: string; // actually a json of @type InfoParsedResult
    generated_prompt?: string;
    message?: string;
  };
  error?: any; // Error details provided by RunPod if the job failed before your handler returned
  // Add other fields from RunPod's webhook payload if needed (e.g., executionTime)
};

const webhookRouter = new Hono<ContextForHono>()
  .all("/model-image", async (c) => {
    const expectedToken = c.env.MODEL_IMAGE_WEBHOOK_TOKEN;
    if (expectedToken) {
      const authHeader = c.req.header("authorization");
      if (authHeader !== `Bearer ${expectedToken}`) {
        return c.text("Unauthorized", 401);
      }
    }

    try {
      const payload = await c.req.json<{
        buildTriggerId: string;
        status: string;
        image?: string;
        message?: string;
      }>();

      if (!payload.buildTriggerId) {
        return c.text("buildTriggerId is required", 400);
      }

      const webhookState = resolveModelImageWebhookState({
        status: payload.status,
        image: payload.image,
        message: payload.message,
      });

      const db = c.get("db");
      await db
        .update(civitaiModelInstalls)
        .set({
          status: webhookState.installStatus,
          statusMessage: webhookState.statusMessage,
          imageName: payload.image ?? null,
          deployedAt: webhookState.deployedAt,
          updatedAt: new Date(),
        })
        .where(eq(civitaiModelInstalls.buildTriggerId, payload.buildTriggerId));

      return c.json({ ok: true });
    } catch (error) {
      console.error("Error processing model image webhook:", error);
      return c.text("Error processing webhook", 500);
    }
  })
  .all("/runpod/downloader", async (c) => {
    try {
      // Update payload type to include model_id in input for delete action
      const payload = await c.req.json<{
        id: string;
        status: string; // RunPod job status (COMPLETED, FAILED, etc.)
        output?: any; // Output from your downloader.py handler
        error?: any; // Error from RunPod if job failed
        input: {
          action: "delete" | "download" | "deleteAll";
          save_path?: string;
          model_id?: number | string; // RunPod payloads may serialize this as a string.
          user_id?: string;
          civitai_file_id?: number;
          model_type?: ModelTypes;
        };
      }>();
      const {
        id: runpodJobId,
        status: runpodJobStatus,
        output,
        input,
      } = payload;
      const db = c.get("db");

      console.log(
        "Received RunPod webhook notification for downloader:",
        payload
      );

      // Determine the status from the webhook payload.
      // Your downloader.py returns a dict with its own "status" key.
      // Use that if available, otherwise use RunPod's status.
      const actionStatus = output?.status || runpodJobStatus; // This will be COMPLETED or ERROR from your handler

      // DOWNLOAD WEBHOOK LOGIC
      if (input.action === "download" || input.action === undefined) {
        const downloadOutput = output ? JSON.stringify(output) : null;

        // Find the file using the runpodJobId that we stored when initiating the download
        const updatedFile = await db
          .update(civitaiFiles)
          .set({
            downloadStatus: actionStatus, // Set status based on handler output/RunPod status
            downloadOutput: downloadOutput,
            updatedAt: new Date(),
          })
          .where(eq(civitaiFiles.runpodJobId, runpodJobId))
          .returning();

        const modelId =
          input.model_id === undefined ? undefined : Number(input.model_id);

        if (runpodJobId) {
          let installStatus =
            actionStatus === "COMPLETED" ? "READY" : "DOWNLOAD_FAILED";
          let statusMessage =
            actionStatus === "COMPLETED"
              ? "Model downloaded and ready."
              : output?.message ?? null;
          let buildTriggerId: string | null = null;
          let buildTriggeredAt: Date | null = null;

          if (actionStatus === "COMPLETED" && updatedFile.length > 0 && modelId !== undefined) {
            const file = updatedFile[0];
            const envConfig = {
              MODEL_IMAGE_REBUILD_PROVIDER: c.env.MODEL_IMAGE_REBUILD_PROVIDER,
            };

            if (isModelImageRebuildConfigured(envConfig)) {
              try {
                buildTriggerId =
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `${modelId}-${file.id}-${Date.now()}`;
                await triggerModelImageBuild(envConfig, {
                  buildTriggerId,
                  civitaiModelId: modelId,
                  civitaiFileId: file.id,
                  downloadUrl: file.downloadUrl,
                  runpodPath: file.runpodPath,
                  modelType: input.model_type ?? ModelTypes.Checkpoint,
                });
                installStatus = "BUILD_QUEUED";
                statusMessage =
                  "Model image rebuild queued. The model will be ready after the Docker image deploys.";
                buildTriggeredAt = new Date();
              } catch (buildError: any) {
                installStatus = "BUILD_FAILED";
                statusMessage =
                  buildError?.message || "Model downloaded, but Docker image rebuild failed.";
                console.error("Failed to trigger model image rebuild:", buildError);
              }
            }
          }

          await db
            .update(civitaiModelInstalls)
            .set({
              status: installStatus,
              statusMessage,
              buildTriggerId,
              downloadCompletedAt:
                actionStatus === "COMPLETED" ? new Date() : null,
              buildTriggeredAt,
              updatedAt: new Date(),
            })
            .where(eq(civitaiModelInstalls.runpodJobId, runpodJobId));
        } else {
          console.warn(
            `Downloader webhook did not include a RunPod job id; skipped install status update.`
          );
        }

        if (updatedFile.length > 0) {
          console.log(
            `Updated download status for file linked to RunPod job ID ${runpodJobId} to ${actionStatus}`
          );

          if (actionStatus === "COMPLETED") {
            const storageUpdateResult = await updateStorageInfo(
              c,
              Number(payload.output?.storage_used) ?? 0
            ); // Call the function to update storage
            if (storageUpdateResult.success) {
              console.log(
                "Storage info updated successfully after download completion."
              );
            } else {
              console.error(
                "Failed to update storage info after download completion:",
                storageUpdateResult.error
              );
            }
          } else if (actionStatus === "ERROR") {
            console.error(
              `Download failed for RunPod job ID ${runpodJobId}:`,
              output?.message || payload.error || "Unknown error"
            );
            // Handle download error (e.g., set a flag to retry, notify user)
          }
        } else {
          console.warn(
            `Could not find database entry for civitaiFile linked to RunPod job ID ${runpodJobId} (download action)`
          );
          // This might happen if the DB record was manually deleted, but RunPod finished later.
          // Log the occurrence, maybe try to delete the file from disk if save_path is available? (Complex)
        }
      }

      // SINGLE DELETE WEBHOOK LOGIC (action: 'delete')
      else if (input.action === "delete") {
        const modelId = input.model_id; // Get the model_id passed in the input
        const userId = input.user_id;

        if (modelId === undefined) {
          // Use undefined check for optional number
          console.error(
            `model_id is missing in the webhook payload for delete action (RunPod Job ID ${runpodJobId}). Cannot update model status.`
          );
          // You might still want to return OK so RunPod doesn't retry endlessly
          return c.text("Error: model_id missing in payload", 400); // Use 400 for bad request payload
        }

        // Update the model status based on the RunPod job result
        let newStatus: "COMPLETED" | "ERROR" | "DELETE_FAILED" | "DELETED"; // Define possible statuses
        let consoleMessage: string;

        if (actionStatus === "COMPLETED") {
          newStatus = "DELETED"; // Mark as DELETED in DB
          consoleMessage = `File deletion COMPLETED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model install status set to DELETED.`;
        } else {
          // actionStatus is "ERROR" or "FAILED" etc.
          newStatus = "DELETE_FAILED"; // Mark as DELETE_FAILED
          consoleMessage = `File deletion FAILED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model install status set to DELETE_FAILED. Error: ${
            output?.message || payload.error || "Unknown error"
          }`;
          console.error(consoleMessage);
          // You might want to log specific error details here
        }

        if (!userId && !runpodJobId) {
          console.warn(
            `Delete webhook for model ${modelId} did not include user_id or runpod job id; skipped install status update.`
          );
          return c.text("OK", 200);
        }

        await db
          .update(civitaiModelInstalls)
          .set({
            status: newStatus,
            runpodJobId: null,
            updatedAt: new Date(),
          })
          .where(
            runpodJobId
              ? eq(civitaiModelInstalls.runpodJobId, runpodJobId)
              : and(
                  eq(civitaiModelInstalls.userId, userId!),
                  eq(civitaiModelInstalls.civitaiModelId, Number(modelId)),
                ),
          );

        console.log(consoleMessage);
      }

      // DELETE ALL WEBHOOK LOGIC (action: 'deleteAll')
      else if (input.action === "deleteAll") {
        if (actionStatus === "COMPLETED") {
          try {
            if (!input.user_id) {
              console.warn(
                `DELETE ALL webhook for RunPod job ${runpodJobId} did not include user_id; skipped install deletion.`
              );
              return c.text("OK", 200);
            }

            await db
              .delete(civitaiModelInstalls)
              .where(eq(civitaiModelInstalls.userId, input.user_id));
            console.log(
              `DELETE ALL COMPLETED (RunPod job ID ${runpodJobId}). Account installs removed.`
            );

            // Update storage after deleteAll
            const storageUpdateResult = await updateStorageInfo(
              c,
              Number(payload.output?.storage_used) ?? 0
            );
            if (storageUpdateResult.success) {
              console.log(
                "Storage info updated successfully after deleteAll completion."
              );
            } else {
              console.error(
                "Failed to update storage info after deleteAll completion:",
                storageUpdateResult.error
              );
            }
          } catch (dbError) {
            console.error(
              `Error deleting account model installs in webhook after deleteAll (RunPod job ID ${runpodJobId}):`,
              dbError
            );
          }
        } else if (actionStatus === "ERROR") {
          console.error(
            `DELETE ALL FAILED (RunPod job ID ${runpodJobId}):`,
            output?.message || payload.error || "Unknown error"
          );
        }
      } else {
        // Handle unexpected action type
        console.warn(
          `Received webhook for unknown action '${input.action}' (RunPod Job ID ${runpodJobId})`
        );
      }

      return c.text("OK", 200); // Always return 200 OK to the webhook sender if processing was successful
    } catch (error) {
      console.error("Error processing RunPod webhook for downloader:", error);
      return c.text("Error processing webhook", 500);
    }
  })
  .all("/runpod/generator", async (c) => {
    const db = c.get("db");

    try {
      // The payload structure depends on RunPod's webhook design and your worker's output
      const payload = await c.req.json<RunPodWebhookPayload>();
      const {
        id: runpodJobId,
        status: runpodJobStatus, // This is the RunPod job status from the image
        output,
        error,
        input,
      } = payload;
      const jobType = input?.job_type ?? "generate_image";

      // Log the *actual* RunPod status received
      console.log(
        `Received RunPod webhook for generator job ${runpodJobId}. Type: ${jobType}, RunPod Status: ${runpodJobStatus}`
      );
      // console.debug("Webhook payload:", JSON.stringify(payload)); // Keep for detailed debugging if needed

      // Find the corresponding job record in your database using the RunPod Job ID
      const dbJob =
        jobType === "generate_prompt"
          ? await db.query.generatorPrompts.findFirst({
              where: (prompts, { eq }) => eq(prompts.runpodJobId, runpodJobId),
            })
          : await db.query.generatorJobs.findFirst({
              where: (jobs, { eq }) => eq(jobs.runpodJobId, runpodJobId),
            });

      if (!dbJob) {
        console.warn(
          `Received webhook for unknown RunPod job ID ${runpodJobId} for job_type ${jobType}. Ignoring.`
        );
        // Return 200 OK anyway, so RunPod doesn't keep retrying a webhook for a job we don't track
        return c.text("OK", 200);
      }

      const updateData: Partial<InsertGeneratorJob | InsertGeneratorPrompt> = {
        updatedAt: new Date(), // Always update timestamp on webhook
        // Initialize result/error fields to null unless populated below
        errorMessage: null,
        errorDetails: null,
        completedAt: null, // Only set for COMPLETED
      };

      // Process based on the RunPod job status (from the image)
      if (runpodJobStatus === "COMPLETED") {
        // Job successfully completed by RunPod worker
        updateData.status = "COMPLETED";
        updateData.completedAt = new Date(); // Record completion time

        if (jobType === "generate_prompt") {
          if (output?.generated_prompt) {
            (updateData as Partial<InsertGeneratorPrompt>).outputPayload = {
              generated_prompt: output.generated_prompt,
            };
          } else {
            updateData.status = "FAILED";
            updateData.completedAt = null;
            updateData.errorMessage =
              "RunPod reported COMPLETED status but no generated prompt was found in output.";
            updateData.errorDetails = output || "No output details";
          }
        } else {
          (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
          (updateData as Partial<InsertGeneratorJob>).imageKey = null;

          try {
          // 1. Parse Info (should be stringified JSON in output.info)
          let parsedInfo: InfoParsedResult | null = null;
          if (output?.info && typeof output.info === "string") {
            try {
              parsedInfo = JSON.parse(output.info);
              (updateData as Partial<InsertGeneratorJob>).generationInfo = parsedInfo; // Store parsed info object
            } catch (parseError) {
              console.error(
                `Failed to parse info string for job ${dbJob.id} (RunPod ${runpodJobId}):`,
                parseError
              );
              // Log error, but don't necessarily fail the job unless info is critical
              // For now, just log and continue without storing info
            }
          } else {
            console.warn(
              `No parsable info string provided in output for job ${dbJob.id} (RunPod ${runpodJobId}) despite COMPLETED status.`
            );
          }

          // 2. Upload Images to R2 (output.images should be an array of base64 strings)
          const uploadedImageUrls: string[] = [];
          if (Array.isArray(output?.images) && output.images.length > 0) {
            const r2 = c.env.R2; // Access R2 binding
            const publicR2UrlPrefix = c.env.R2_PUBLIC_BUCKET_URL; // Access public URL prefix

            if (!r2 || !publicR2UrlPrefix) {
              // This is a critical configuration error
              throw new Error(
                "R2 binding or PUBLIC_R2_URL is not configured in environment."
              );
            }

            for (let i = 0; i < output.images.length; i++) {
              const base64Data = output.images[i]; // Assumed to be unprefixed base64
              if (!base64Data || typeof base64Data !== "string") {
                console.warn(
                  `Skipping invalid/empty image data for job ${dbJob.id}, index ${i}.`
                );
                continue; // Skip invalid entry, try the next
              }

              try {
                // Decode base64 (Node.js Buffer or Workers atob) - assuming Cloudflare Workers environment
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let j = 0; j < byteCharacters.length; j++) {
                  byteNumbers[j] = byteCharacters.charCodeAt(j);
                }
                const byteArray = new Uint8Array(byteNumbers);

                // Generate a unique key for R2 object
                const r2Key = `generator-jobs/${runpodJobId}/${i + 1}.png`; // e.g., generator-jobs/some-runpod-id/1.png

                // Upload to R2
                await r2.put(r2Key, byteArray, {
                  httpMetadata: { contentType: "image/png" },
                });

                // Construct public URL
                const publicUrl = `${r2Key}`;
                uploadedImageUrls.push(publicUrl);
                console.log(
                  `Uploaded image ${i + 1}/${output.images.length} for job ${
                    dbJob.id
                  }.`
                );
              } catch (uploadError: any) {
                console.error(
                  `Failed to upload image ${i + 1} for job ${
                    dbJob.id
                  } (RunPod ${runpodJobId}) to R2:`,
                  uploadError
                );
                // If even one image fails to upload *after* RunPod completed,
                // we should probably mark the job as FAILED in our system
                updateData.status = "FAILED"; // Overwrite status
                updateData.completedAt = null; // Not fully completed in our system
                updateData.errorMessage = `RunPod job completed, but failed to process/upload images to R2 (image ${
                  i + 1
                }).`;
                updateData.errorDetails =
                  uploadError.message || JSON.stringify(uploadError);
                (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
                (updateData as Partial<InsertGeneratorJob>).imageKey = null; // Don't store partial URLs
                // Stop processing further images for this job
                break;
              }
            }

            // If we went through the loop and the status is still COMPLETED, all images succeeded (or were skipped if invalid data)
            if (updateData.status === "COMPLETED") {
              (updateData as Partial<InsertGeneratorJob>).imageKey = uploadedImageUrls[0]; // Store the collected URLs
              console.log(
                `Finished processing images for DB job ${dbJob.id} (RunPod ${runpodJobId}). Stored ${uploadedImageUrls.length} URLs.`
              );
            }
          } else {
            // RunPod status is COMPLETED but no images array or an empty array
            console.warn(
              `RunPod reported COMPLETED status for job ${dbJob.id} (RunPod ${runpodJobId}) but no images were found in output.`
            );
            // Decide how critical this is. If images are the primary output, lack of images on success is a failure in our flow.
            updateData.status = "FAILED"; // Mark as FAILED in DB
            updateData.completedAt = null;
            updateData.errorMessage =
              "RunPod reported COMPLETED status but no images were found in output.";
            updateData.errorDetails = output || "No output details";
            // Keep parsed info if available? Let's discard for FAILED state consistency.
            (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
          }
          } catch (processingError: any) {
          // Catch critical errors during the COMPLETED state processing block (e.g., R2 config missing)
          console.error(
            `Critical processing error for job ${dbJob.id} (RunPod ${runpodJobId}) during COMPLETED state handling:`,
            processingError
          );
          updateData.status = "FAILED"; // Mark job as FAILED due to internal error
          updateData.completedAt = null;
          updateData.errorMessage = `Internal webhook processing error during COMPLETED state: ${processingError.message}`;
          updateData.errorDetails =
            processingError.message || JSON.stringify(processingError);
          (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
          (updateData as Partial<InsertGeneratorJob>).imageKey = null;
          }
        }
        // --- End processing successful output ---
      } else if (runpodJobStatus === "FAILED") {
        // RunPod job reported FAILED
        updateData.status = "FAILED";
        updateData.errorMessage =
          output?.message || error?.message || "RunPod job reported FAILED.";
        // Store full output/error details
        updateData.errorDetails = output || error || payload;
        console.error(
          `DB job ${dbJob.id} (RunPod ${runpodJobId}): RunPod reported FAILED.`
        );
      } else if (runpodJobStatus === "CANCELLED") {
        // RunPod job was CANCELLED
        updateData.status = "CANCELLED"; // Requires schema update to include "CANCELLED"
        updateData.errorMessage =
          error?.message ||
          payload.output?.message ||
          "RunPod job was CANCELLED.";
        updateData.errorDetails = error || payload.output || payload; // Store details if any
        console.warn(
          `DB job ${dbJob.id} (RunPod ${runpodJobId}): RunPod reported CANCELLED.`
        );
      } else if (runpodJobStatus === "TIMED_OUT") {
        // RunPod job TIMED_OUT
        // Mapping TIMED_OUT to FAILED in DB is common and simplifies schema if you don't need a distinct status
        updateData.status = "FAILED"; // Map TIMED_OUT to FAILED
        updateData.errorMessage =
          error?.message || payload.output?.message || "RunPod job TIMED_OUT.";
        updateData.errorDetails = error || payload.output || payload; // Store details if any
        console.error(
          `DB job ${dbJob.id} (RunPod ${runpodJobId}): RunPod reported TIMED_OUT.`
        );
      } else {
        // Handle any other unexpected RunPod statuses (IN_QUEUE, IN_PROGRESS shouldn't trigger webhooks)
        // If we get here, it's an unexpected state for a final webhook. Treat as failure.
        console.warn(
          `Received webhook for RunPod job ID ${runpodJobId} with unexpected final status '${runpodJobStatus}'. Treating as FAILED.`
        );
        updateData.status = "FAILED";
        updateData.errorMessage = `RunPod job ended with unexpected status: ${runpodJobStatus}`;
        updateData.errorDetails = payload.output || error || payload;
      }

      // Update the database record with the determined status and results/errors
      try {
        if (jobType === "generate_prompt") {
          await db
            .update(generatorPrompts)
            .set(updateData as Partial<InsertGeneratorPrompt>)
            .where(eq(generatorPrompts.id, dbJob.id));
        } else {
          await db
            .update(generatorJobs)
            .set(updateData as Partial<InsertGeneratorJob>)
            .where(eq(generatorJobs.id, dbJob.id));
        }
        console.log(
          `DB job record ${dbJob.id} updated from webhook (Final Status: ${updateData.status}).`
        );
      } catch (dbUpdateError: any) {
        console.error(
          `Failed to update DB job record ${dbJob.id} from webhook (RunPod ID ${runpodJobId}, Target Status: ${updateData.status}): ${dbUpdateError.message}`,
          dbUpdateError
        );
        // Log the DB error but *still return 200* to RunPod.
        // This prevents RunPod from infinitely retrying if *our database* is having issues.
        // The job status in our DB might be outdated, but the webhook delivery is acknowledged.
      }

      // Always return 200 OK to the webhook sender if processing the webhook payload itself was successful
      return c.text("OK", 200);
    } catch (error: any) {
      // This catches errors in processing the *webhook payload* itself (e.g., invalid JSON)
      // or critical errors like missing R2 config.
      console.error(
        "Error processing RunPod webhook for generator:",
        error.message,
        error
      );
      // Return 500 to signal RunPod to retry this webhook delivery payload.
      return c.text("Error processing webhook", 500);
    }
  });

export default webhookRouter;
