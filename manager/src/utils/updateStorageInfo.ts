import db from "@/db";
import { storageInfo } from "@/schema/storageInfo";
import { eq } from "drizzle-orm";

export async function updateStorageInfo(newSize: number) {
  const directoryPath = "/runpod-volume/";

  try {
    const existingStorageInfo = await db.select().from(storageInfo).where(eq(storageInfo.id, 1));

    if (existingStorageInfo.length === 0) {
      await db.insert(storageInfo).values({
        id: 1,
        totalStorageBytes: newSize,
      });
      console.log("Initial storage info record created.");
    } else {
      await db
        .update(storageInfo)
        .set({
          totalStorageBytes: newSize,
          updatedAt: new Date(),
        })
        .where(eq(storageInfo.id, 1));
      console.log("Storage info record updated.");
    }

    return { success: true, storageBytes: newSize };
  } catch (error) {
    console.error("Error updating storage info:", error);
    return { success: false, error: "Failed to update storage info" };
  }
}
