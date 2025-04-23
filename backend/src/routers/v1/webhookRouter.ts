import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { eq } from "drizzle-orm";
import { civitaiFiles, civitaiModels } from "@/schema"; // Import civitaiModels
import { updateStorageInfo } from "@/utils/updateStorageInfo";
// Make sure you have schema definitions imported

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
    // Keep your generator webhook logic as is
    try {
      const payload = await c.req.json<{
        id: string;
        status: string;
        output?: any;
        error?: any;
      }>();
      const { id: runpodJobId, status: jobStatus, output } = payload;
      const db = c.get("db");

      console.log(
        "Received RunPod webhook notification for generator:",
        payload
      );

      // Handle generator webhook logic here (you might have a different table or update process)
      console.log("Generator webhook payload:", payload); // Placeholder for generator logic

      // Example: Update a 'generation_jobs' table
      // await db.update(generationJobs).set({ status: jobStatus, output: JSON.stringify(output) }).where(eq(generationJobs.runpodJobId, runpodJobId));

      return c.text("OK", 200);
    } catch (error) {
      console.error("Error processing RunPod webhook for generator:", error);
      return c.text("Error", 500);
    }
  });

export default webhookRouter;
