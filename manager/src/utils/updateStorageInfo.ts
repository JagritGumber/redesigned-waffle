import { storageInfo } from "@/schema/storageInfo";
import { eq } from "drizzle-orm";

export async function updateStorageInfo(
  context: { env: any; db: any }, // Adjusted to receive context object
  newSize: number
) {
  const db = context.db;
  const directoryPath = "/runpod-volume/"; // Path to your Runpod volume

  try {
    const existingStorageInfo = await db
      .select()
      .from(storageInfo)
      .where(eq(storageInfo.id, 1));

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
