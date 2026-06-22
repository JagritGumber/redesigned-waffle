import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import {
  civitaiFiles,
  civitaiModelInstalls,
  civitaiModels,
  generatorJobs,
  InsertGeneratorJob,
  generatorPrompts,
  InsertGeneratorPrompt,
} from "@/schema";
import { updateStorageInfo } from "@/utils/updateStorageInfo";
import { InfoParsedResult } from "@/types/generator";
import db from "@/db";
import s3 from "@/s3";
import { triggerModelImageBuild } from "@/services/modelImageBuildService";
import { resolveModelImageWebhookState } from "@/services/modelImageStatusService";

// Define TypeBox schema for DownloaderWebhookPayload
const DownloaderWebhookPayloadSchema = t.Object({
  id: t.String(),
  status: t.String(),
  output: t.Optional(
    t.Object({
      status: t.Optional(t.String()),
      message: t.Optional(t.String()),
      storage_used: t.Optional(t.Number()),
    })
  ),
  error: t.Optional(
    t.Object({
      message: t.Optional(t.String()),
      stack: t.Optional(t.String()),
    })
  ),
  input: t.Object({
    action: t.Union([t.Literal("delete"), t.Literal("download"), t.Literal("deleteAll")]),
    save_path: t.Optional(t.String()),
    model_id: t.Optional(t.Number()),
    user_id: t.Optional(t.String()),
    civitai_file_id: t.Optional(t.Number()),
    db_file_id: t.Optional(t.Number()),
  }),
});

// Define TypeBox schema for GeneratorWebhookPayload
const GeneratorWebhookPayloadSchema = t.Object({
  id: t.String(), // RunPod Job ID
  status: t.String(), // RunPod job status (COMPLETED, FAILED, RUNNING, etc.)
  input: t.Object({
    job_type: t.Union([t.Literal("generate_image"), t.Literal("generate_prompt")]),
    data: t.Any(), // This can be more specific if needed, but for webhook processing, 'any' might be acceptable for the input data itself.
  }),
  output: t.Optional(
    t.Object({
      images: t.Optional(t.Array(t.String())), // Base64 images with no prefix, need to add data:image/png;base64, prefix
      info: t.Optional(t.String()), // actually a json of @type InfoParsedResult
      message: t.Optional(t.String()), // Added to handle cases where output contains a message
      generated_prompt: t.Optional(t.String()), // Added for prompt generation output
      storage_used: t.Optional(t.Number()), // For downloader webhook
    })
  ),
  error: t.Optional(
    t.Object({
      message: t.Optional(t.String()),
      stack: t.Optional(t.String()),
    })
  ),
});

const ModelImageWebhookPayloadSchema = t.Object({
  buildTriggerId: t.String(),
  status: t.String(),
  image: t.Optional(t.String()),
  message: t.Optional(t.String()),
});

export const webhookRouter = new Elysia({ prefix: "/webhooks" })
  .all(
    "/model-image",
    async ({ body, request, set }) => {
      const expectedToken = Bun.env.MODEL_IMAGE_WEBHOOK_TOKEN;
      if (expectedToken) {
        const authorization = request.headers.get("authorization");
        if (authorization !== `Bearer ${expectedToken}`) {
          set.status = 401;
          return { status: "error", message: "Invalid model image webhook token." };
        }
      }

      const { buildTriggerId, status, image, message } = body;
      const webhookState = resolveModelImageWebhookState({
        status,
        image,
        message,
      });

      const updated = await db
        .update(civitaiModelInstalls)
        .set({
          status: webhookState.installStatus,
          statusMessage: webhookState.statusMessage,
          imageName: image ?? null,
          deployedAt: webhookState.deployedAt,
          updatedAt: new Date(),
        })
        .where(eq(civitaiModelInstalls.buildTriggerId, buildTriggerId))
        .returning();

      if (updated.length === 0) {
        set.status = 404;
        return { status: "error", message: "No model install found for build trigger." };
      }

      set.status = 200;
      return { status: "success", installsUpdated: updated.length };
    },
    {
      body: ModelImageWebhookPayloadSchema,
    },
  )
  .all(
    "/runpod/downloader",
    async ({ body, set }) => {
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

          if (updatedFile.length > 0) {
            const file = updatedFile[0];
            const modelId = input.model_id;
            if (modelId !== undefined) {
              await db
                .update(civitaiModels)
                .set({
                  status: actionStatus === "COMPLETED" ? "DOWNLOADED" : "DOWNLOAD_FAILED",
                  updatedAt: new Date(),
                })
                .where(eq(civitaiModels.id, modelId));
            }

            console.log(
              `Updated download status for file linked to RunPod job ID ${runpodJobId} to ${actionStatus}`
            );

            if (actionStatus === "COMPLETED") {
              let installStatus = "READY";
              let statusMessage = "Model downloaded and ready.";
              let buildTriggerId: string | null = null;

              if (modelId !== undefined) {
                try {
                  const build = await triggerModelImageBuild({
                    civitaiModelId: modelId,
                    civitaiFileId: file.id,
                    downloadUrl: file.downloadUrl,
                    runpodPath: file.runpodPath,
                    runpodJobId,
                  });
                  installStatus = build.triggered ? "BUILD_QUEUED" : "READY";
                  buildTriggerId = build.buildTriggerId;
                  statusMessage = build.message;
                } catch (buildError: any) {
                  installStatus = "BUILD_FAILED";
                  statusMessage =
                    buildError?.message || "Model downloaded, but Docker image rebuild failed.";
                  console.error("Failed to trigger model image rebuild:", buildError);
                }
              }

              await db
                .update(civitaiModelInstalls)
                .set({
                  status: installStatus,
                  statusMessage,
                  buildTriggerId,
                  downloadCompletedAt: new Date(),
                  buildTriggeredAt: installStatus === "BUILD_QUEUED" ? new Date() : null,
                  updatedAt: new Date(),
                })
                .where(eq(civitaiModelInstalls.runpodJobId, runpodJobId));

              const storageUpdateResult = await updateStorageInfo(
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
            } else if (actionStatus === "ERROR" || actionStatus === "FAILED") {
              await db
                .update(civitaiModelInstalls)
                .set({
                  status: "DOWNLOAD_FAILED",
                  statusMessage: output?.message || "Model download failed.",
                  updatedAt: new Date(),
                })
                .where(eq(civitaiModelInstalls.runpodJobId, runpodJobId));

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
          const userId = input.user_id;

          if (modelId === undefined) {
            set.status = 400;
            return "Error: model_id missing in payload";
          }

          if (!userId && !runpodJobId) {
            console.warn(
              `Delete webhook for model ${modelId} did not include user_id or RunPod job id; skipped install status update.`
            );
            return "OK";
          }

          let newStatus: "COMPLETED" | "ERROR" | "DELETE_FAILED" | "DELETED";
          let consoleMessage: string;

          if (actionStatus === "COMPLETED") {
            newStatus = "DELETED";
            consoleMessage = `File deletion COMPLETED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model install status set to DELETED.`;
          } else {
            newStatus = "DELETE_FAILED";
            consoleMessage = `File deletion FAILED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model install status set to DELETE_FAILED. Error: ${
              output?.message || payload.error || "Unknown error"
            }`;
            console.error(consoleMessage);
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
                    eq(civitaiModelInstalls.civitaiModelId, modelId),
                  ),
            );

          console.log(consoleMessage);
        } else if (input.action === "deleteAll") {
          if (actionStatus === "COMPLETED") {
            try {
              if (!input.user_id) {
                console.warn(
                  `DELETE ALL webhook for RunPod job ${runpodJobId} did not include user_id; skipped install deletion.`
                );
                set.status = 200;
                return "OK";
              }

              await db
                .delete(civitaiModelInstalls)
                .where(eq(civitaiModelInstalls.userId, input.user_id));
              console.log(
                `DELETE ALL COMPLETED (RunPod job ID ${runpodJobId}). Account installs removed.`
              );

              const storageUpdateResult = await updateStorageInfo(
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
    },
    {
      body: DownloaderWebhookPayloadSchema, // Use TypeBox schema
    }
  )
  .all(
    "/runpod/generator",
    async ({ body, set }) => {
      // Added db and env to destructuring
      try {
        const payload = body;
        const { id: runpodJobId, status: runpodJobStatus, output, error, input } = payload;
        const jobType = input.job_type;

        console.log(
          `Received RunPod webhook for generator job ${runpodJobId}. Type: ${jobType}, RunPod Status: ${runpodJobStatus}`
        );

        let dbRecord: InsertGeneratorJob | InsertGeneratorPrompt | undefined;
        let updateTable: typeof generatorJobs | typeof generatorPrompts; // Use specific types

        if (jobType === "generate_image") {
          dbRecord = await db.query.generatorJobs.findFirst({
            where: (jobs, { eq }) => eq(jobs.runpodJobId, runpodJobId),
          });
          updateTable = generatorJobs;
        } else if (jobType === "generate_prompt") {
          dbRecord = await db.query.generatorPrompts.findFirst({
            where: (prompts, { eq }) => eq(prompts.runpodJobId, runpodJobId), // Fix eq type
          });
          updateTable = generatorPrompts;
        } else {
          console.warn(`Received webhook for unknown job_type '${jobType}'. Ignoring.`);
          set.status = 200;
          return "OK";
        }

        if (!dbRecord) {
          console.warn(
            `Received webhook for unknown RunPod job ID ${runpodJobId} for job_type ${jobType}. Ignoring.`
          );
          set.status = 200;
          return "OK";
        }

        const updateData: Partial<InsertGeneratorJob | InsertGeneratorPrompt> = {
          updatedAt: new Date(),
          errorMessage: null,
          errorDetails: null,
          completedAt: null,
        };

        if (runpodJobStatus === "COMPLETED") {
          updateData.status = "COMPLETED";
          updateData.completedAt = new Date();

          if (jobType === "generate_image") {
            // Image specific processing
            (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
            (updateData as Partial<InsertGeneratorJob>).imageKey = null;

            try {
              let parsedInfo: InfoParsedResult | null = null;
              if (output?.info && typeof output.info === "string") {
                try {
                  parsedInfo = JSON.parse(output.info);
                  (updateData as Partial<InsertGeneratorJob>).generationInfo = parsedInfo;
                } catch (parseError) {
                  console.error(
                    `Failed to parse info string for job ${dbRecord.id} (RunPod ${runpodJobId}):`,
                    parseError
                  );
                }
              } else {
                console.warn(
                  `No parsable info string provided in output for job ${dbRecord.id} (RunPod ${runpodJobId}) despite COMPLETED status.`
                );
              }

              const uploadedImageUrls: string[] = [];
              if (Array.isArray(output?.images) && output.images.length > 0) {
                for (let i = 0; i < output.images.length; i++) {
                  const base64Data = output.images[i];
                  if (!base64Data || typeof base64Data !== "string") {
                    console.warn(
                      `Skipping invalid/empty image data for job ${dbRecord.id}, index ${i}.`
                    );
                    continue;
                  }

                  try {
                    const byteArray = Buffer.from(base64Data, "base64");

                    const r2Key = `generator-jobs/${runpodJobId}/${i + 1}.png`;

                    await s3.write(r2Key, byteArray, {
                      type: "image/png",
                    });

                    const publicUrl = `${r2Key}`;
                    uploadedImageUrls.push(publicUrl);
                    console.log(
                      `Uploaded image ${i + 1}/${output.images.length} for job ${dbRecord.id}.`
                    );
                  } catch (uploadError: any) {
                    console.error(
                      `Failed to upload image ${i + 1} for job ${
                        dbRecord.id
                      } (RunPod ${runpodJobId}) to R2:`,
                      uploadError
                    );
                    (updateData as Partial<InsertGeneratorJob>).status = "FAILED";
                    (updateData as Partial<InsertGeneratorJob>).completedAt = null;
                    (
                      updateData as Partial<InsertGeneratorJob>
                    ).errorMessage = `RunPod job completed, but failed to process/upload images to R2 (image ${
                      i + 1
                    }).`;
                    (updateData as Partial<InsertGeneratorJob>).errorDetails =
                      uploadError.message || JSON.stringify(uploadError);
                    (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
                    (updateData as Partial<InsertGeneratorJob>).imageKey = null;
                    break;
                  }
                }

                if ((updateData as Partial<InsertGeneratorJob>).status === "COMPLETED") {
                  (updateData as Partial<InsertGeneratorJob>).imageKey = uploadedImageUrls[0];
                  console.log(
                    `Finished processing images for DB job ${dbRecord.id} (RunPod ${runpodJobId}). Stored ${uploadedImageUrls.length} URLs.`
                  );
                }
              } else {
                console.warn(
                  `RunPod reported COMPLETED status for job ${dbRecord.id} (RunPod ${runpodJobId}) but no images were found in output.`
                );
                (updateData as Partial<InsertGeneratorJob>).status = "FAILED";
                (updateData as Partial<InsertGeneratorJob>).completedAt = null;
                (updateData as Partial<InsertGeneratorJob>).errorMessage =
                  "RunPod reported COMPLETED status but no images were found in output.";
                (updateData as Partial<InsertGeneratorJob>).errorDetails =
                  output || "No output details";
                (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
              }
            } catch (processingError: any) {
              console.error(
                `Critical processing error for job ${dbRecord.id} (RunPod ${runpodJobId}) during COMPLETED state handling:`,
                processingError
              );
              (updateData as Partial<InsertGeneratorJob>).status = "FAILED";
              (updateData as Partial<InsertGeneratorJob>).completedAt = null;
              (
                updateData as Partial<InsertGeneratorJob>
              ).errorMessage = `Internal webhook processing error during COMPLETED state: ${processingError.message}`;
              (updateData as Partial<InsertGeneratorJob>).errorDetails =
                processingError.message || JSON.stringify(processingError);
              (updateData as Partial<InsertGeneratorJob>).generationInfo = null;
              (updateData as Partial<InsertGeneratorJob>).imageKey = null;
            }
          } else if (jobType === "generate_prompt") {
            if (output?.generated_prompt) {
              (updateData as Partial<InsertGeneratorPrompt>).outputPayload = {
                generated_prompt: output.generated_prompt,
              };
              console.log(`Prompt generated for DB prompt ${dbRecord.id} (RunPod ${runpodJobId}).`);
            } else {
              console.warn(
                `RunPod reported COMPLETED status for prompt job ${dbRecord.id} (RunPod ${runpodJobId}) but no generated_prompt was found in output.`
              );
              updateData.status = "FAILED";
              updateData.completedAt = null;
              updateData.errorMessage =
                "RunPod reported COMPLETED status but no generated prompt was found in output.";
              updateData.errorDetails = output || "No output details";
            }
          }
        } else if (runpodJobStatus === "FAILED") {
          updateData.status = "FAILED";
          updateData.errorMessage =
            output?.message || error?.message || "RunPod job reported FAILED.";
          updateData.errorDetails = error || payload; // Changed from output || error || payload to output || error || payload.error?.message
          console.error(
            `DB ${jobType} ${dbRecord.id} (RunPod ${runpodJobId}): RunPod reported FAILED.`
          );
        } else if (runpodJobStatus === "CANCELLED") {
          updateData.status = "CANCELLED";
          updateData.errorMessage =
            error?.message || payload.output?.message || "RunPod job was CANCELLED.";
          updateData.errorDetails = error || payload; // Changed from error || payload.output || payload to error || payload.output || payload.error?.message
          console.warn(
            `DB ${jobType} ${dbRecord.id} (RunPod ${runpodJobId}): RunPod reported CANCELLED.`
          );
        } else if (runpodJobStatus === "TIMED_OUT") {
          updateData.status = "FAILED";
          updateData.errorMessage =
            error?.message || payload.output?.message || "RunPod job TIMED_OUT.";
          updateData.errorDetails = error || payload; // Changed from error || payload.output || payload to error || payload.output || payload.error?.message
          console.error(
            `DB ${jobType} ${dbRecord.id} (RunPod ${runpodJobId}): RunPod reported TIMED_OUT.`
          );
        } else {
          console.warn(
            `Received webhook for RunPod job ID ${runpodJobId} with unexpected final status '${runpodJobStatus}'. Treating as FAILED.`
          );
          updateData.status = "FAILED";
          updateData.errorMessage = `RunPod job ended with unexpected status: ${runpodJobStatus}`;
          updateData.errorDetails = payload.output || error || payload; // Changed from payload.output || error || payload to payload.output || error || payload.error?.message
        }

        try {
          if (!dbRecord.id) {
            console.error("No db record id was there");
            return;
          }
          await db.update(updateTable).set(updateData).where(eq(updateTable.id, dbRecord.id));
          console.log(
            `DB ${jobType} record ${dbRecord.id} updated from webhook (Final Status: ${updateData.status}).`
          );
        } catch (dbUpdateError: any) {
          console.error(
            `Failed to update DB ${jobType} record ${dbRecord.id} from webhook (RunPod ID ${runpodJobId}, Target Status: ${updateData.status}): ${dbUpdateError.message}`,
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
    },
    {
      body: GeneratorWebhookPayloadSchema,
    }
  );
