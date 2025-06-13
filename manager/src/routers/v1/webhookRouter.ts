import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { civitaiFiles, civitaiModels, generatorJobs, InsertGeneratorJob } from "@/schema";
import { updateStorageInfo } from "@/utils/updateStorageInfo";
import { InfoParsedResult } from "@/types/generator";

type RunPodWebhookPayload = {
  id: string; // RunPod Job ID
  status: string; // RunPod job status (COMPLETED, FAILED, RUNNING, etc.)
  output?: {
    images: string[]; // Base64 images with no prefix, need to add data:image/png;base64, prefix
    info: string; // actually a json of @type InfoParsedResult
    message?: string; // Added to handle cases where output contains a message
  };
  error?: any; // Error details provided by RunPod if the job failed before your handler returned
  // Add other fields from RunPod's webhook payload if needed (e.g., executionTime)
};

export const webhookRouter = new Elysia({ prefix: "/webhook" })
  .all(
    "/runpod/downloader",
    async ({
      body,
      set,
      db,
      env,
    }: {
      body: {
        id: string;
        status: string;
        output?: any;
        error?: any;
        input: {
          action: "delete" | "download" | "deleteAll";
          save_path?: string;
          model_id?: number;
        };
      };
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
      env: {
        R2: any; // Assuming R2 is available in env for updateStorageInfo
      };
    }) => {
      try {
        const payload = body;
        const { id: runpodJobId, status: runpodJobStatus, output, input } = payload;

        console.log("Received RunPod webhook notification for downloader:", payload);

        const actionStatus = output?.status || runpodJobStatus;

        if (input.action === "download" || input.action === undefined) {
          const downloadOutput = output ? JSON.stringify(output) : null;

          const updatedFile = await db
            .update(civitaiFiles)
            .set({
              downloadStatus: actionStatus,
              downloadOutput: downloadOutput,
              updatedAt: new Date(),
            })
            .where(eq(civitaiFiles.runpodJobId, runpodJobId))
            .returning();
          const updatedModel = await db.update(civitaiModels).set({
            status: actionStatus === "COMPLETED" ? "DOWNLOADED" : "DOWNLOAD_FAILED",
          });

          if (updatedFile.length > 0) {
            console.log(
              `Updated download status for file linked to RunPod job ID ${runpodJobId} to ${actionStatus}`
            );

            if (actionStatus === "COMPLETED") {
              const storageUpdateResult = await updateStorageInfo(
                { env, db }, // Pass env and db as part of a context-like object
                Number(payload.output?.storage_used) ?? 0
              );
              if (storageUpdateResult.success) {
                console.log("Storage info updated successfully after download completion.");
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
            }
          } else {
            console.warn(
              `Could not find database entry for civitaiFile linked to RunPod job ID ${runpodJobId} (download action)`
            );
          }
        } else if (input.action === "delete") {
          const modelId = input.model_id;
          const savePath = input.save_path;

          if (modelId === undefined) {
            set.status = 400;
            return "Error: model_id missing in payload";
          }

          const modelRecord = await db.query.civitaiModels.findFirst({
            where: (models: any, { eq }: any) => eq(models.id, modelId),
          });

          if (!modelRecord) {
            console.warn(
              `Could not find civitaiModel with ID ${modelId} for delete action (RunPod Job ID ${runpodJobId}). Model might have been deleted manually.`
            );
            set.status = 200;
            return "OK";
          }

          let newStatus: "COMPLETED" | "ERROR" | "DELETE_FAILED" | "DELETED";
          let consoleMessage: string;

          if (actionStatus === "COMPLETED") {
            newStatus = "DELETED";
            consoleMessage = `File deletion COMPLETED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model status set to DELETED.`;
          } else {
            newStatus = "DELETE_FAILED";
            consoleMessage = `File deletion FAILED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model status set to DELETE_FAILED. Error: ${
              output?.message || payload.error || "Unknown error"
            }`;
            console.error(consoleMessage);
          }

          await db
            .update(civitaiModels)
            .set({
              status: newStatus,
              runpodJobId: null,
              updatedAt: new Date(),
            })
            .where(eq(civitaiModels.id, modelId));

          console.log(consoleMessage);
        } else if (input.action === "deleteAll") {
          if (actionStatus === "COMPLETED") {
            try {
              await db.update(civitaiModels).set({
                status: "DELETED",
                updatedAt: new Date(),
              });
              console.log(
                `DELETE ALL COMPLETED (RunPod job ID ${runpodJobId}). All models in DB marked as DELETED.`
              );

              const storageUpdateResult = await updateStorageInfo(
                { env, db }, // Pass env and db as part of a context-like object
                Number(payload.output?.storage_used) ?? 0
              );
              if (storageUpdateResult.success) {
                console.log("Storage info updated successfully after deleteAll completion.");
              } else {
                console.error(
                  "Failed to update storage info after deleteAll completion:",
                  storageUpdateResult.error
                );
              }
            } catch (dbError) {
              console.error(
                `Error updating all models status to DELETED in webhook after deleteAll (RunPod job ID ${runpodJobId}):`,
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
          console.warn(
            `Received webhook for unknown action '${input.action}' (RunPod Job ID ${runpodJobId})`
          );
        }

        set.status = 200;
        return "OK";
      } catch (error: any) {
        console.error("Error processing RunPod webhook for downloader:", error.message, error);
        set.status = 500;
        return "Error processing webhook";
      }
    }
  )
  .all(
    "/runpod/generator",
    async ({
      body,
      set,
      db,
      env,
    }: {
      body: RunPodWebhookPayload;
      set: { status: number | undefined };
      db: any; // Replace 'any' with your actual Drizzle DB type
      env: {
        R2: any; // Assuming R2 is available in env for image uploads
        R2_PUBLIC_BUCKET_URL: string;
      };
    }) => {
      try {
        const payload = body;
        const { id: runpodJobId, status: runpodJobStatus, output, error } = payload;

        console.log(
          `Received RunPod webhook for generator job ${runpodJobId}. RunPod Status: ${runpodJobStatus}`
        );

        const dbJob = await db.query.generatorJobs.findFirst({
          where: (jobs: any, { eq }: any) => eq(jobs.runpodJobId, runpodJobId),
        });

        if (!dbJob) {
          console.warn(`Received webhook for unknown RunPod job ID ${runpodJobId}. Ignoring.`);
          set.status = 200;
          return "OK";
        }

        const updateData: Partial<InsertGeneratorJob> = {
          updatedAt: new Date(),
          generationInfo: null,
          imageKey: null,
          errorMessage: null,
          errorDetails: null,
          completedAt: null,
        };

        if (runpodJobStatus === "COMPLETED") {
          updateData.status = "COMPLETED";
          updateData.completedAt = new Date();

          try {
            let parsedInfo: InfoParsedResult | null = null;
            if (output?.info && typeof output.info === "string") {
              try {
                parsedInfo = JSON.parse(output.info);
                updateData.generationInfo = parsedInfo;
              } catch (parseError) {
                console.error(
                  `Failed to parse info string for job ${dbJob.id} (RunPod ${runpodJobId}):`,
                  parseError
                );
              }
            } else {
              console.warn(
                `No parsable info string provided in output for job ${dbJob.id} (RunPod ${runpodJobId}) despite COMPLETED status.`
              );
            }

            const uploadedImageUrls: string[] = [];
            if (Array.isArray(output?.images) && output.images.length > 0) {
              const r2 = env.R2;
              const publicR2UrlPrefix = env.R2_PUBLIC_BUCKET_URL;

              if (!r2 || !publicR2UrlPrefix) {
                throw new Error("R2 binding or PUBLIC_R2_URL is not configured in environment.");
              }

              for (let i = 0; i < output.images.length; i++) {
                const base64Data = output.images[i];
                if (!base64Data || typeof base64Data !== "string") {
                  console.warn(
                    `Skipping invalid/empty image data for job ${dbJob.id}, index ${i}.`
                  );
                  continue;
                }

                try {
                  const byteCharacters = atob(base64Data);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let j = 0; j < byteCharacters.length; j++) {
                    byteNumbers[j] = byteCharacters.charCodeAt(j);
                  }
                  const byteArray = new Uint8Array(byteNumbers);

                  const r2Key = `generator-jobs/${runpodJobId}/${i + 1}.png`;

                  await r2.put(r2Key, byteArray, {
                    httpMetadata: { contentType: "image/png" },
                  });

                  const publicUrl = `${r2Key}`;
                  uploadedImageUrls.push(publicUrl);
                  console.log(
                    `Uploaded image ${i + 1}/${output.images.length} for job ${dbJob.id}.`
                  );
                } catch (uploadError: any) {
                  console.error(
                    `Failed to upload image ${i + 1} for job ${
                      dbJob.id
                    } (RunPod ${runpodJobId}) to R2:`,
                    uploadError
                  );
                  updateData.status = "FAILED";
                  updateData.completedAt = null;
                  updateData.errorMessage = `RunPod job completed, but failed to process/upload images to R2 (image ${
                    i + 1
                  }).`;
                  updateData.errorDetails = uploadError.message || JSON.stringify(uploadError);
                  updateData.generationInfo = null;
                  updateData.imageKey = null;
                  break;
                }
              }

              if (updateData.status === "COMPLETED") {
                updateData.imageKey = uploadedImageUrls[0];
                console.log(
                  `Finished processing images for DB job ${dbJob.id} (RunPod ${runpodJobId}). Stored ${uploadedImageUrls.length} URLs.`
                );
              }
            } else {
              console.warn(
                `RunPod reported COMPLETED status for job ${dbJob.id} (RunPod ${runpodJobId}) but no images were found in output.`
              );
              updateData.status = "FAILED";
              updateData.completedAt = null;
              updateData.errorMessage =
                "RunPod reported COMPLETED status but no images were found in output.";
              updateData.errorDetails = output || "No output details";
              updateData.generationInfo = null;
            }
          } catch (processingError: any) {
            console.error(
              `Critical processing error for job ${dbJob.id} (RunPod ${runpodJobId}) during COMPLETED state handling:`,
              processingError
            );
            updateData.status = "FAILED";
            updateData.completedAt = null;
            updateData.errorMessage = `Internal webhook processing error during COMPLETED state: ${processingError.message}`;
            updateData.errorDetails = processingError.message || JSON.stringify(processingError);
            updateData.generationInfo = null;
            updateData.imageKey = null;
          }
        } else if (runpodJobStatus === "FAILED") {
          updateData.status = "FAILED";
          updateData.errorMessage =
            output?.message || error?.message || "RunPod job reported FAILED.";
          updateData.errorDetails = output || error || payload;
          console.error(`DB job ${dbJob.id} (RunPod ${runpodJobId}): RunPod reported FAILED.`);
        } else if (runpodJobStatus === "CANCELLED") {
          updateData.status = "CANCELLED";
          updateData.errorMessage =
            error?.message || payload.output?.message || "RunPod job was CANCELLED.";
          updateData.errorDetails = error || payload.output || payload;
          console.warn(`DB job ${dbJob.id} (RunPod ${runpodJobId}): RunPod reported CANCELLED.`);
        } else if (runpodJobStatus === "TIMED_OUT") {
          updateData.status = "FAILED";
          updateData.errorMessage =
            error?.message || payload.output?.message || "RunPod job TIMED_OUT.";
          updateData.errorDetails = error || payload.output || payload;
          console.error(`DB job ${dbJob.id} (RunPod ${runpodJobId}): RunPod reported TIMED_OUT.`);
        } else {
          console.warn(
            `Received webhook for RunPod job ID ${runpodJobId} with unexpected final status '${runpodJobStatus}'. Treating as FAILED.`
          );
          updateData.status = "FAILED";
          updateData.errorMessage = `RunPod job ended with unexpected status: ${runpodJobStatus}`;
          updateData.errorDetails = payload.output || error || payload;
        }

        try {
          await db.update(generatorJobs).set(updateData).where(eq(generatorJobs.id, dbJob.id));
          console.log(
            `DB job record ${dbJob.id} updated from webhook (Final Status: ${updateData.status}).`
          );
        } catch (dbUpdateError: any) {
          console.error(
            `Failed to update DB job record ${dbJob.id} from webhook (RunPod ID ${runpodJobId}, Target Status: ${updateData.status}): ${dbUpdateError.message}`,
            dbUpdateError
          );
        }

        set.status = 200;
        return "OK";
      } catch (error: any) {
        console.error("Error processing RunPod webhook for generator:", error.message, error);
        set.status = 500;
        return "Error processing webhook";
      }
    }
  );
