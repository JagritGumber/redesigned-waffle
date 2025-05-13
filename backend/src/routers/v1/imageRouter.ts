import { ContextForHono } from "@/types/context";
import { Hono } from "hono";

const imageRouter = new Hono<ContextForHono>()
  .get("/:key", async (c) => {
    const bucket = c.env.R2;

    if (!bucket) {
      return c.text("R2 bucket not configured.", 500);
    }
    const key = c.req.param("key");
    if (!key) {
      return c.text("Missing image key.", 400);
    }
    try {
      const object = await bucket.get(key);

      if (!object) {
        return c.notFound();
      }

      const contentType =
        object.httpMetadata?.contentType || "application/octet-stream";
      const cacheControl =
        object.httpMetadata?.cacheControl || "public, max-age=86400";

      return c.body(object.body, 200, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        ETag: object.etag,
        "Last-Modified": object.uploaded.toUTCString(),
      });
    } catch (error: any) {
      console.error(
        `Error fetching object ${key} from R2: ${error.message}`,
        error
      );
      return c.text("Internal server error fetching image.", 500);
    }
  })
  .get("/gallery/:id", async (c) => {
    const db = c.get("db");
    const jobId = c.req.param("id"); // Get the ID from the URL path

    const queryParams = c.req.query();
    const statusFilter = queryParams.status || "COMPLETED";


    if (!db) {
      console.error(
        "Server configuration error: Database binding not available."
      );
      return c.json(
        {
          status: "error",
          message: "Server configuration error: Database not available.",
        },
        500
      );
    }

    if (!jobId) {
      console.error("Missing job ID in request path.");
      return c.json({ status: "error", message: "Job ID is required." }, 400);
    }
    
    try {
      // 1. Fetch the target job
      const targetJob = await db.query.generatorJobs.findFirst({
        where: (jobs, { and, eq, isNotNull }) =>
          and(
            eq(jobs.id, jobId),
            eq(jobs.status, statusFilter as any), // Apply status filter
            isNotNull(jobs.imageKey) // Ensure it's an image we can view
          ),
      });

      if (!targetJob) {
        console.warn(
          `Target job not found or does not meet criteria for ID: ${jobId}`
        );
        return c.json(
          { status: "error", message: "Job not found or not viewable." },
          404
        );
      }

      const targetCreatedAt = targetJob.createdAt;

      // 2. Fetch jobs *after* the target (which have an *earlier* createdAt in DESC order)
      const jobsAfter = await db.query.generatorJobs.findMany({
        where: (jobs, { and, lt, eq, isNotNull }) =>
          and(
            lt(jobs.createdAt, targetCreatedAt), // Earlier timestamp
            eq(jobs.status, statusFilter as any), // Apply status filter
            isNotNull(jobs.imageKey) // Ensure it's viewable
          ),
        orderBy: (jobs, { desc }) => desc(jobs.createdAt), // Same sort order as gallery
      });

      // 3. Fetch jobs *before* the target (which have a *later* createdAt in DESC order)
      // We need to fetch them in ASC order by createdAt to get the "latest" ones before the target easily
      const jobsBefore = await db.query.generatorJobs.findMany({
        where: (jobs, { and, gt, eq, isNotNull }) =>
          and(
            gt(jobs.createdAt, targetCreatedAt), // Later timestamp
            eq(jobs.status, statusFilter as any), // Apply status filter
            isNotNull(jobs.imageKey) // Ensure it's viewable
          ),
        orderBy: (jobs, { asc }) => asc(jobs.createdAt), // Need ASC here
      });

      // 4. Combine results: jobsBefore (reversed), targetJob, jobsAfter
      // jobsBefore were fetched ASC, so reverse to put them before target in DESC order view
      const combinedJobs = [...jobsBefore.reverse(), targetJob, ...jobsAfter];

      // Find the index of the target job in the combined list
      const initialIndex = combinedJobs.findIndex(
        (job) => job.id === targetJob.id
      );

      console.log(
        `Fetched ${jobsBefore.length} jobs before, ${jobsAfter.length} jobs after for ID ${jobId}. Combined: ${combinedJobs.length}`
      );

      // Return the array of jobs and the index of the target job
      return c.json({
        status: "success",
        message: "Successfully fetched job details and neighbors.",
        items: combinedJobs, // Return the array of jobs
        initialIndex: initialIndex, // Return the index of the current job
      });
    } catch (error: any) {
      console.error(
        `API Handler unexpected error fetching job ${jobId} with neighbors: ${error.message}`,
        error
      );
      return c.json(
        {
          status: "error",
          message:
            "Internal server error while fetching job details and neighbors.",
          error: error.message,
        },
        500
      );
    }
  });

export default imageRouter;
