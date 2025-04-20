// src/utils/updateStorageInfo.ts
import { storageInfo } from "@/schema/storageInfo";
import { ContextForHono } from "@/types/context";
import { eq } from "drizzle-orm";
import { Context } from "hono";

export async function updateStorageInfo(
  c: Context<ContextForHono>,
  newSize: number
) {
  const db = c.get("db");
  const directoryPath = "/runpod-volume/"; // Path to your Runpod volume

  try {
    // Check if a storage info record exists, if not, create one (for initial setup)
    const existingStorageInfo = await db
      .select()
      .from(storageInfo)
      .where(eq(storageInfo.id, 1)); // Assuming id=1 for global record

    if (existingStorageInfo.length === 0) {
      await db.insert(storageInfo).values({
        id: 1, // Assuming id=1 for global record
        totalStorageBytes: newSize,
      });
      console.log("Initial storage info record created.");
    } else {
      await db
        .update(storageInfo)
        .set({
          totalStorageBytes: newSize,
          updatedAt: new Date(), // Update timestamp
        })
        .where(eq(storageInfo.id, 1)); // Update record with id=1
      console.log("Storage info record updated.");
    }

    return { success: true, storageBytes: newSize };
  } catch (error) {
    console.error("Error updating storage info:", error);
    return { success: false, error: "Failed to update storage info" };
  }
}
