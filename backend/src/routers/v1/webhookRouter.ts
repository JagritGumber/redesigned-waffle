import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { eq } from "drizzle-orm";
import {
  civitaiFiles,
  civitaiModels,
  generatorJobs,
  InsertGeneratorJob,
} from "@/schema"; // Import civitaiModels
import { updateStorageInfo } from "@/utils/updateStorageInfo";
// Make sure you have schema definitions imported

// Define the structure of the output payload from the Python worker (on success)
type WorkerResult = {
  image?: string;
  time_taken?: number;
  model_path_used?: string;
  model_type_used?: "SDXL 1.0" | "SD 1.5" | "Illustrious" | "Pony"; // Use updated literals here
  loras_applied?: string[];
  tis_applied?: string[];
  cached_base_model_used?: boolean;
  loaded_ti_tokens?: { path: string; token: string }[] | null;
  // Add other fields your worker might return in the 'result' object
};

// Define the structure of the full payload received by the webhook
// This matches RunPod's completed/failed webhook structure, plus the worker's output
type RunPodWebhookPayload = {
  id: string; // RunPod Job ID
  status: string; // RunPod job status (COMPLETED, FAILED, RUNNING, etc.)
  input?: any; // The original input sent to the worker (useful for context)
  output?: {
    // The output from your Python handler's return dict
    status: "COMPLETED" | "FAILED" | "PARTIAL_COMPLETED"; // Internal worker status
    message?: string;
    result?: WorkerResult; // The actual data on success
    lora_errors?: any[];
    ti_errors?: any[];
    errors?: any[]; // From downloader worker delete results
    items_deleted?: number; // From downloader worker deleteAll
    total_items_attempted?: number; // From downloader worker deleteAll
    storage_used?: number; // Storage usage reported by downloader
    workerDetails?: any; // Catch-all for other details
  };
  error?: any; // Error details provided by RunPod if the job failed before your handler returned
  // Add other fields from RunPod's webhook payload if needed (e.g., executionTime)
};

const webhookRouter = new Hono<ContextForHono>()
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
          model_id?: string; // <-- Add model_id for delete action
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
        const updatedModel = await db.update(civitaiModels).set({
          status:
            actionStatus === "COMPLETED" ? "DOWNLOADED" : "DOWNLOAD_FAILED",
        });

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
        const savePath = input.save_path; // Get save_path from input

        if (modelId === undefined) {
          // Use undefined check for optional number
          console.error(
            `model_id is missing in the webhook payload for delete action (RunPod Job ID ${runpodJobId}). Cannot update model status.`
          );
          // You might still want to return OK so RunPod doesn't retry endlessly
          return c.text("Error: model_id missing in payload", 400); // Use 400 for bad request payload
        }

        // Find the model record using the ID passed in the input
        const modelRecord = await db.query.civitaiModels.findFirst({
          where: (models, { eq }) => eq(models.id, modelId),
        });

        if (!modelRecord) {
          console.warn(
            `Could not find civitaiModel with ID ${modelId} for delete action (RunPod Job ID ${runpodJobId}). Model might have been deleted manually.`
          );
          // Model already deleted in DB, nothing to update. Return OK.
          return c.text("OK", 200);
        }

        // Update the model status based on the RunPod job result
        let newStatus: "COMPLETED" | "ERROR" | "DELETE_FAILED" | "DELETED"; // Define possible statuses
        let consoleMessage: string;

        if (actionStatus === "COMPLETED") {
          newStatus = "DELETED"; // Mark as DELETED in DB
          consoleMessage = `File deletion COMPLETED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model status set to DELETED.`;
        } else {
          // actionStatus is "ERROR" or "FAILED" etc.
          newStatus = "DELETE_FAILED"; // Mark as DELETE_FAILED
          consoleMessage = `File deletion FAILED for RunPod job ID ${runpodJobId} (Model ID ${modelId}). Model status set to DELETE_FAILED. Error: ${
            output?.message || payload.error || "Unknown error"
          }`;
          console.error(consoleMessage);
          // You might want to log specific error details here
        }

        // Update the civitaiModels table
        await db
          .update(civitaiModels)
          .set({
            status: newStatus,
            // Optionally clear deletionRunpodJobId or keep for history
            runpodJobId: null, // Clear the job ID once processed
            updatedAt: new Date(),
          })
          .where(eq(civitaiModels.id, modelId));

        console.log(consoleMessage);
      }

      // DELETE ALL WEBHOOK LOGIC (action: 'deleteAll')
      else if (input.action === "deleteAll") {
        if (actionStatus === "COMPLETED") {
          try {
            await db.update(civitaiModels).set({
              status: "DELETED",
              updatedAt: new Date(),
            });
            console.log(
              `DELETE ALL COMPLETED (RunPod job ID ${runpodJobId}). All models in DB marked as DELETED.`
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
  .post("/runpod/generator", async (c) => {
    const db = c.get("db");

    try {
      // The payload structure depends on RunPod's webhook design and your worker's output
      const payload = await c.req.json<RunPodWebhookPayload>();
      const {
        id: runpodJobId,
        status: runpodJobStatus,
        output,
        error,
      } = payload;

      console.log(
        `Received RunPod webhook for generator job ${runpodJobId}. Status: ${runpodJobStatus}`
      );
      console.debug("Webhook payload:", JSON.stringify(payload)); // Log full payload for debugging if needed

      // Find the corresponding job record in your database using the RunPod Job ID
      const dbJob = await db.query.generatorJobs.findFirst({
        where: (jobs, { eq }) => eq(jobs.runpodJobId, runpodJobId),
      });

      if (!dbJob) {
        console.warn(
          `Received webhook for unknown RunPod job ID ${runpodJobId}. Ignoring.`
        );
        // Return 200 OK anyway, so RunPod doesn't keep retrying a webhook for a job we don't track
        return c.text("OK", 200);
      }

      // Update the database record based on the webhook payload
      const updateData: Partial<InsertGeneratorJob> = {
        status: "WEBHOOK_RECEIVED", // Mark that we got the webhook
      };

      // Determine final status based on worker output or RunPod status
      const workerInternalStatus = output?.status; // e.g., 'COMPLETED', 'FAILED', 'PARTIAL_COMPLETED' from your Python handler
      const finalStatus = workerInternalStatus || runpodJobStatus; // Use worker status if available, else RunPod status

      if (finalStatus === "COMPLETED") {
        updateData.status = "COMPLETED";
        updateData.resultPayload = output; // Save the actual generation result
        updateData.errorMessage = null; // Clear any previous error messages
        updateData.errorDetails = null; // Clear any previous error details
        console.log(`DB job ${dbJob.id} (RunPod ${runpodJobId}): COMPLETED.`);
      } else if (finalStatus === "PARTIAL_COMPLETED") {
        // Handle partial completion - decide how you want to represent this in your DB
        updateData.status = "COMPLETED"; // Or maybe 'PARTIAL_COMPLETED' if schema supports
        updateData.resultPayload = output.images[0]; // Maybe save partial result if any?
        updateData.errorMessage = output;
        updateData.errorDetails = output; // Store full output for details
        console.warn(
          `DB job ${dbJob.id} (RunPod ${runpodJobId}): PARTIAL_COMPLETED.`
        );
      } else if (finalStatus === "FAILED") {
        // RunPod job failed OR worker handler returned status='FAILED'
        updateData.status = "FAILED";
        updateData.errorMessage =
          output?.message || error?.message || "Worker job failed.";
        updateData.resultPayload = null; // No successful result
        updateData.errorDetails = output || error; // Store output or RunPod error details
        console.error(`DB job ${dbJob.id} (RunPod ${runpodJobId}): FAILED.`);
      } else {
        // Handle other potential RunPod statuses like 'CANCELED', 'TIMEOUT', etc.
        // Or unexpected statuses from the worker output
        updateData.status = "FAILED"; // Treat anything else as a failure in your system
        updateData.errorMessage = `Worker job ended with unexpected status: ${finalStatus}`;
        updateData.resultPayload = null;
        updateData.errorDetails = output || error || payload; // Store whatever we got
        console.error(
          `DB job ${dbJob.id} (RunPod ${runpodJobId}): Unexpected final status '${finalStatus}'.`
        );
      }

      try {
        await db
          .update(generatorJobs)
          .set(updateData)
          .where(eq(generatorJobs.id, dbJob.id));
        console.log(`DB job record ${dbJob.id} updated from webhook.`);
      } catch (dbUpdateError: any) {
        console.error(
          `Failed to update DB job record ${dbJob.id} from webhook (RunPod ID ${runpodJobId}): ${dbUpdateError.message}`,
          dbUpdateError
        );
        // IMPORTANT: DO NOT return a non-200 status here. RunPod will retry endlessly if your DB is down.
        // Just log the error and return OK. The job status might be stale in your DB, but at least the webhook processing didn't crash.
      }

      // Always return 200 OK to the webhook sender if processing was successful
      return c.text("OK", 200);
    } catch (error: any) {
      // This catches errors in processing the *webhook payload* itself (e.g., invalid JSON, unexpected structure)
      console.error(
        "Error processing RunPod webhook for generator:",
        error.message,
        error
      );
      // Return 500 to signal RunPod to retry this webhook delivery
      return c.text("Error processing webhook", 500);
    }
  });

export default webhookRouter;
