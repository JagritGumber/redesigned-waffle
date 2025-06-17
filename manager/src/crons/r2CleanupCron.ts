import { Patterns, cron } from "@elysiajs/cron";
import s3 from "@/s3";
import db from "@/db";
import { generatorJobs } from "@/schema/generatorJob";

const r2CleanupCron = cron({
  name: "r2ImageCleanup",
  pattern: Patterns.daily(),
  async run() {
    console.log("Starting R2 image cleanup cron job...");

    try {
      // 1. Fetch all imageKeys from the database
      const dbImageKeys = await db.select({ imageKey: generatorJobs.imageKey }).from(generatorJobs);
      const validImageKeys = new Set(
        dbImageKeys.map((row) => row.imageKey).filter(Boolean) as string[]
      );

      console.log(`Found ${validImageKeys.size} valid image keys in the database.`);

      // 2. List all objects in the R2 bucket
      const bucketName = Bun.env.R2_BUCKET_NAME;
      if (!bucketName) {
        console.error("R2_BUCKET_NAME environment variable is not set. Skipping R2 cleanup.");
        return;
      }

      let continuationToken: string | undefined;
      let objectsToDelete: string[] = [];

      let listedObjects;
      do {
        listedObjects = await s3.list({
          continuationToken: continuationToken,
        });

        if (!listedObjects.contents) {
          console.log("No objects found in R2 bucket.");
          break;
        }

        for (const object of listedObjects.contents) {
          if (object.key && !validImageKeys.has(object.key)) {
            console.log(`Found unreferenced R2 object: ${object.key}`);
            objectsToDelete.push(object.key);
          }
        }
        continuationToken = listedObjects.nextContinuationToken;
      } while (listedObjects.isTruncated); // Use IsTruncated for continuation

      console.log(`Found ${objectsToDelete.length} unreferenced R2 objects.`);

      // 3. Delete unreferenced objects
      if (objectsToDelete.length > 0) {
        for (const key of objectsToDelete) {
          console.log(`Deleting R2 object: ${key}`);
          await s3.delete(key, {
            bucket: Bun.env.R2_BUCKET_NAME,
            endpoint: Bun.env.R2_PUBLIC_BUCKET_URL,
            accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
            secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
          });
          console.log(`Successfully deleted ${key}`);
        }
        console.log("R2 cleanup cron job completed. All unreferenced objects deleted.");
      } else {
        console.log("No unreferenced R2 objects to delete. Cleanup completed.");
      }
    } catch (error) {
      console.error("Error during R2 cleanup cron job:", error);
    }
  },
});

export default r2CleanupCron;
