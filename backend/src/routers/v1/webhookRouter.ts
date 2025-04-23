// ./v1/webhookRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { eq } from "drizzle-orm";
import { civitaiFiles } from "@/schema";
import { updateStorageInfo } from "@/utils/updateStorageInfo";

const webhookRouter = new Hono<ContextForHono>()
  .all("/runpod/downloader", async (c) => {
    try {
      const payload = await c.req.json<{
        id: string;
        status: string;
        output?: any;
        error?: any;
        input: {
          action: "delete" | "download" | "deleteAll";
          save_path?: string;
        };
      }>();
      const { id: runpodJobId, status: jobStatus, output, input } = payload;
      const db = c.get("db");

      console.log(
        "Received RunPod webhook notification for downloader:",
        payload
      );

      if (["download"].includes(input.action)) {
        const updatedFile = await db
          .update(civitaiFiles)
          .set({
            downloadStatus: jobStatus,
            downloadOutput: output ? JSON.stringify(output) : null,
          })
          .where(eq(civitaiFiles.runpodJobId, runpodJobId))
          .returning();

        if (updatedFile.length > 0) {
          console.log(
            `Updated download status for RunPod job ID ${runpodJobId} to ${jobStatus} (downloader)`
          );
        } else {
          console.warn(
            `Could not find database entry for RunPod job ID ${runpodJobId} (downloader)`
          );
        }
      }

      if (["delete"].includes(input.action)){
        
      }

      if (jobStatus === "COMPLETED") {
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
      }

      return c.text("OK", 200);
    } catch (error) {
      console.error("Error processing RunPod webhook for downloader:", error);
      return c.text("Error", 500);
    }
  })
  .post("/runpod/generator", async (c) => {
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

      return c.text("OK", 200);
    } catch (error) {
      console.error("Error processing RunPod webhook for generator:", error);
      return c.text("Error", 500);
    }
  });

export default webhookRouter;
