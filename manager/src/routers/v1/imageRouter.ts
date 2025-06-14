import { Elysia, t } from "elysia";
import { s3 } from "bun";
import db from "@/db";

export const imageRouter = new Elysia({ prefix: "/images" })
  .get("/:key", async ({ params, set }) => {
    const key = params.key;
    if (!key) {
      set.status = 400;
      return "Missing image key.";
    }
    try {
      const object = s3.file(key, {
        accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
        endpoint: Bun.env.R2_PUBLIC_BUCKET_URL,
        bucket: Bun.env.R2_BUCKET_NAME,
        secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
      });
      const stat = await object.stat();

      if (!object) {
        set.status = 404;
        return "Not Found";
      }

      const contentType = stat.type || "application/octet-stream";
      const cacheControl = "public, max-age=86400";

      set.status = 200;
      set.headers["Content-Type"] = contentType;
      set.headers["Cache-Control"] = cacheControl;
      set.headers["ETag"] = stat.etag;
      set.headers["Last-Modified"] = stat.lastModified.toUTCString();
      return await object.bytes();
    } catch (error: any) {
      console.error(`Error fetching object ${key} from R2: ${error.message}`, error);
      set.status = 500;
      return "Internal server error fetching image.";
    }
  })
  .get("/gallery/:id", async ({ params, query, set }) => {
    const jobId = params.id; // Get the ID from the URL path
    const statusFilter = query.status || "COMPLETED";

    if (!db) {
      console.error("Server configuration error: Database binding not available.");
      set.status = 500;
      return {
        status: "error",
        message: "Server configuration error: Database not available.",
      };
    }

    if (!jobId) {
      console.error("Missing job ID in request path.");
      set.status = 400;
      return { status: "error", message: "Job ID is required." };
    }

    try {
      // 1. Fetch the target job
      const targetJob = await db.query.generatorJobs.findFirst({
        where: (jobs: any, { and, eq, isNotNull }: any) =>
          and(
            eq(jobs.id, jobId),
            eq(jobs.status, statusFilter as any), // Apply status filter
            isNotNull(jobs.imageKey) // Ensure it's an image we can view
          ),
      });

      if (!targetJob) {
        console.warn(`Target job not found or does not meet criteria for ID: ${jobId}`);
        set.status = 404;
        return { status: "error", message: "Job not found or not viewable." };
      }

      const targetCreatedAt = targetJob.createdAt;

      // 2. Fetch jobs *after* the target (which have an *earlier* createdAt in DESC order)
      const jobsAfter = await db.query.generatorJobs.findMany({
        where: (jobs: any, { and, lt, eq, isNotNull }: any) =>
          and(
            lt(jobs.createdAt, targetCreatedAt), // Earlier timestamp
            eq(jobs.status, statusFilter as any), // Apply status filter
            isNotNull(jobs.imageKey) // Ensure it's viewable
          ),
        orderBy: (jobs: any, { desc }: any) => desc(jobs.createdAt), // Same sort order as gallery
      });

      // 3. Fetch jobs *before* the target (which have a *later* createdAt in DESC order)
      // We need to fetch them in ASC order by createdAt to get the "latest" ones before the target easily
      const jobsBefore = await db.query.generatorJobs.findMany({
        where: (jobs: any, { and, gt, eq, isNotNull }: any) =>
          and(
            gt(jobs.createdAt, targetCreatedAt), // Later timestamp
            eq(jobs.status, statusFilter as any), // Apply status filter
            isNotNull(jobs.imageKey) // Ensure it's viewable
          ),
        orderBy: (jobs: any, { asc }: any) => asc(jobs.createdAt), // Need ASC here
      });

      // 4. Combine results: jobsBefore (reversed), targetJob, jobsAfter
      // jobsBefore were fetched ASC, so reverse to put them before target in DESC order view
      const combinedJobs = [...jobsBefore.reverse(), targetJob, ...jobsAfter];

      // Find the index of the target job in the combined list
      const initialIndex = combinedJobs.findIndex((job: any) => job.id === targetJob.id);

      console.log(
        `Fetched ${jobsBefore.length} jobs before, ${jobsAfter.length} jobs after for ID ${jobId}. Combined: ${combinedJobs.length}`
      );

      set.status = 200;
      return {
        status: "success",
        message: "Successfully fetched job details and neighbors.",
        items: combinedJobs, // Return the array of jobs
        initialIndex: initialIndex, // Return the index of the current job
      };
    } catch (error: any) {
      console.error(
        `API Handler unexpected error fetching job ${jobId} with neighbors: ${error.message}`,
        error
      );
      set.status = 500;
      return {
        status: "error",
        message: "Internal server error while fetching job details and neighbors.",
        error: error.message,
      };
    }
  })
  .post(
    "/scrape-and-post",
    async ({ body, set }) => {
      const { imageId } = body;
      console.log(`Received request to scrape and post image: ${imageId}`);

      // Placeholder for future Selenium integration
      // Here you would add logic to:
      // 1. Fetch image details using imageId from your database/storage
      // 2. Initialize Selenium (or similar tool)
      // 3. Log in to DeviantArt/Patreon
      // 4. Navigate to posting page
      // 5. Upload image and fill in details
      // 6. Submit post
      // 7. Handle success/failure

      set.status = 200;
      return {
        status: "success",
        message: `Scrape and post initiated for image ID: ${imageId}`,
      };
    },
    {
      body: t.Object({
        imageId: t.String(),
      }),
    },
  );
