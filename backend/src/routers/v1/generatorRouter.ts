import { Hono } from "hono";

import { and, eq, inArray } from "drizzle-orm";
import {
  civitaiModelInstalls,
  generatorJobs,
  generatorPrompts,
  InsertGeneratorJob,
  InsertGeneratorPrompt,
} from "@/schema";

import runpodSdk from "runpod-sdk";
import { ContextForHono } from "@/types/context";
import { verifyAuth } from "@hono/auth-js";
import { getRequiredUserId } from "@/utils/auth";
import { Value } from "@sinclair/typebox/value";
import {
  GenerateRequestPayload,
  GenerateRequestPayloadType,
  GeneratePromptRequestPayload,
  GeneratePromptRequestPayloadType,
} from "@/validators/generation";

async function handleGenerateImage(c: any) {
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ status: "error", message: "Authentication required." }, 401);
    }

    const { RUNPOD_API_KEY, RUNPOD_GENERATOR_ID, RUNPOD_WEBHOOK_URL } = c.env;
    const db = c.get("db");

    if (!RUNPOD_API_KEY || !RUNPOD_GENERATOR_ID || !RUNPOD_WEBHOOK_URL || !db) {
      console.error(
        "Server configuration error: Missing required environment variables or database binding."
      );
      return c.json(
        {
          status: "error",
          message:
            "Server configuration error: Required resources not available.",
        },
        500
      );
    }

    let clientInput: GenerateRequestPayloadType;
    try {
      clientInput = await c.req.json();
      Value.Assert(GenerateRequestPayload, clientInput);
    } catch (e: any) {
      console.error(`Failed to parse request body as JSON: ${e.message}`);
      return c.json(
        {
          status: "error",
          message: "Invalid JSON body.",
          e: JSON.stringify(e),
        },
        400
      );
    }

    const {
      prompt,
      numImages,
      checkpoint,
      height,
      loras,
      negativePrompt,
      seed,
      steps,
      textualInversions,
      width,
    } = clientInput;

    const requestedModelIds = [
      checkpoint.modelId,
      ...loras.map((lora) => lora.modelId),
      ...textualInversions.map((tti) => tti.modelId),
    ];
    const uniqueRequestedModelIds = [...new Set(requestedModelIds)];
    const installedModels = await db
      .select({
        id: civitaiModelInstalls.civitaiModelId,
        status: civitaiModelInstalls.status,
        statusMessage: civitaiModelInstalls.statusMessage,
      })
      .from(civitaiModelInstalls)
      .where(
        and(
          eq(civitaiModelInstalls.userId, userId),
          inArray(civitaiModelInstalls.civitaiModelId, uniqueRequestedModelIds),
        ),
      );
    const installedModelIds = new Set(installedModels.map((model) => model.id));
    const missingModelIds = uniqueRequestedModelIds.filter(
      (modelId) => !installedModelIds.has(modelId),
    );

    if (missingModelIds.length > 0) {
      return c.json(
        {
          status: "error",
          message: "One or more selected models are not installed for this account.",
          modelIds: missingModelIds,
        },
        403,
      );
    }

    const notReadyModels = installedModels.filter((model) => model.status !== "READY");
    if (notReadyModels.length > 0) {
      return c.json(
        {
          status: "error",
          message: "One or more selected models are still being installed for this account.",
          models: notReadyModels.map((model) => ({
            modelId: model.id,
            installStatus: model.status,
            statusMessage: model.statusMessage,
          })),
        },
        409,
      );
    }

    const checkpointPromise = db.query.civitaiModels.findFirst({
      where: (model, { eq }) => eq(model.id, checkpoint.modelId),
      with: {
        modelVersions: {
          where: (version, { eq }) => eq(version.id, checkpoint.modelVersionId),
          with: {
            files: true,
          },
        },
      },
    });

    const loraPromises = loras.map((lora) =>
      db.query.civitaiModels.findFirst({
        where: (model, { eq }) => eq(model.id, lora.modelId),
        with: {
          modelVersions: {
            where: (version, { eq }) => eq(version.id, lora.modelVersionId),
            with: {
              files: true,
            },
          },
        },
      })
    );

    const ttiPromises = textualInversions.map((tti) =>
      db.query.civitaiModels.findFirst({
        where: (model, { eq }) => eq(model.id, tti.modelId),
        with: {
          modelVersions: {
            where: (version, { eq }) => eq(version.id, tti.modelVersionId),
            with: {
              files: true,
            },
          },
        },
      })
    );

    const [checkpointModel, loraModels, ttiModels] = await Promise.all([
      checkpointPromise,
      Promise.all(loraPromises),
      Promise.all(ttiPromises),
    ]);

    const promptTokenArray = prompt
      .split(",")
      .filter(
        (item) => item.trim().length !== 0 && item.trim() !== "undefined"
      );

    const negativePromptTokenArray = negativePrompt
      .split(",")
      .filter(
        (item) => item.trim().length !== 0 && item.trim() !== "undefined"
      );

    const loraTokenArray = loraModels.map(
      (lora, index) =>
        `<lora:${lora!
          .modelVersions!.at(0)!
          .files!.at(0)!
          .runpodPath!.split("/")
          .at(-1)
          ?.split(".")
          .at(0)}:${loras[index].weight}>`
    );

    const positiveTtiTokenArray = ttiModels
      .filter((_tti, index) => textualInversions[index].type === "positive")
      .map(
        (tti, index) =>
          `${tti!
            .modelVersions!.at(0)!
            .files!.at(0)!
            .runpodPath!.split("/")
            .at(-1)
            ?.split(".")
            .at(0)}`
      );

    const negativeTtiTokenArray = ttiModels
      .filter((_tti, index) => textualInversions[index].type === "positive")
      .map(
        (tti, index) =>
          `${tti!
            .modelVersions!.at(0)!
            .files!.at(0)!
            .runpodPath!.split("/")
            .at(-1)
            ?.split(".")
            .at(0)}`
      );

    const fullPrompt = [
      ...promptTokenArray,
      ...loraTokenArray,
      ...positiveTtiTokenArray,
    ].join(", ");

    const fullNegativePrompt = [
      ...negativePromptTokenArray,
      ...negativeTtiTokenArray,
    ].join(", ");

    const modifiedPayload = {
      prompt: fullPrompt,
      negative_prompt: fullNegativePrompt,
      width,
      height,
      steps,
      cfg_scale: 7.5,
      seed,
      override_settings: {
        sd_model_checkpoint: checkpointModel?.modelVersions
          ?.at(0)
          ?.files.at(0)
          ?.runpodPath.split("/")
          .at(-1),
      },
    };

    const newDbJobId = crypto.randomUUID();
    const initialJobRecord: InsertGeneratorJob = {
      id: newDbJobId,
      userId,
      status: "PENDING",
      inputPayload: clientInput satisfies GenerateRequestPayloadType,
    };

    try {
      await db.insert(generatorJobs).values(initialJobRecord);
      console.log(`Created DB job record: ${newDbJobId} (Status: PENDING)`);
    } catch (dbInsertError: any) {
      console.error(
        `Failed to insert initial DB job record ${newDbJobId}: ${dbInsertError.message}`,
        dbInsertError
      );
      return c.json(
        { status: "error", message: "Internal error recording job request." },
        500
      );
    }

    let runpodJobId: string | undefined = undefined;

    try {
      console.log(
        `Triggering RunPod generator worker ${RUNPOD_GENERATOR_ID} for DB job ${newDbJobId}...`
      );

      const runpod = runpodSdk(RUNPOD_API_KEY);
      const endpoint = runpod.endpoint(RUNPOD_GENERATOR_ID);

      const webhookUrl = `${RUNPOD_WEBHOOK_URL}/generator`;
      console.log(`Setting webhook URL for RunPod job: ${webhookUrl}`);
      console.log(clientInput);

      const triggeredJob = await endpoint!.run({
        input: modifiedPayload,
        webhook: webhookUrl,
      });

      if (triggeredJob?.id) {
        runpodJobId = triggeredJob.id;
        console.log(
          `RunPod job triggered successfully. RunPod Job ID: ${runpodJobId} for DB job ${newDbJobId}`
        );

        const updateData: Partial<InsertGeneratorJob> = {
          runpodJobId: runpodJobId,
          status: "RUNNING",
        };
        await db
          .update(generatorJobs)
          .set(updateData)
          .where(eq(generatorJobs.id, newDbJobId));
        console.log(
          `DB job record ${newDbJobId} updated with RunPod ID ${runpodJobId} and status RUNNING.`
        );

        return c.json(
          {
            status: "accepted",
            message: "Image generation job initiated.",
            db_job_id: newDbJobId,
            runpod_job_id: runpodJobId,
          },
          202
        );
      } else {
        const msg = `RunPod endpoint.run did not return a job ID for DB job ${newDbJobId}.`;
        console.error(msg, triggeredJob);

        const updateData: Partial<InsertGeneratorJob> = {
          status: "FAILED",
          errorMessage: msg,
          errorDetails: JSON.stringify(triggeredJob),
        };

        await db
          .update(generatorJobs)
          .set(updateData)
          .where(eq(generatorJobs.id, newDbJobId));

        return c.json(
          { status: "error", message: "Failed to trigger RunPod job." },
          500
        );
      }
    } catch (error: any) {
      console.error(
        `API Handler unexpected error during RunPod job triggering for DB job ${newDbJobId}: ${error.message}`,
        error
      );

      const updateData: Partial<InsertGeneratorJob> = {
        status: "FAILED",
        errorMessage: `API Handler error during RunPod triggering: ${error.message}`,
        errorDetails: JSON.stringify({
          stack: error.stack,
          message: error.message,
        }),
      };

      try {
        await db
          .update(generatorJobs)
          .set(updateData)
          .where(eq(generatorJobs.id, newDbJobId));
        console.log(
          `DB job record ${newDbJobId} updated to FAILED after API handler error during triggering.`
        );
      } catch (dbUpdateError: any) {
        console.error(
          `Failed to update DB job record ${newDbJobId} to FAILED after handler error: ${dbUpdateError.message}`,
          dbUpdateError
        );
      }

      return c.json(
        {
          status: "error",
          message: "Internal server error while initiating job.",
        },
        500
      );
    }
}

const generatorRouter = new Hono<ContextForHono>()
  .use("*", verifyAuth())
  .post("/generate-image", handleGenerateImage)
  .post("/generate", handleGenerateImage)
  .post("/generate-prompt", async (c) => {
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ status: "error", message: "Authentication required." }, 401);
    }

    const { RUNPOD_API_KEY, RUNPOD_GENERATOR_ID, RUNPOD_WEBHOOK_URL } = c.env;
    const db = c.get("db");

    if (!RUNPOD_API_KEY || !RUNPOD_GENERATOR_ID || !RUNPOD_WEBHOOK_URL || !db) {
      console.error(
        "Server configuration error: Missing required environment variables or database binding."
      );
      return c.json(
        { status: "error", message: "Server configuration error: Required resources not available." },
        500,
      );
    }

    let clientInput: GeneratePromptRequestPayloadType;
    try {
      clientInput = await c.req.json();
      Value.Assert(GeneratePromptRequestPayload, clientInput);
    } catch (e: any) {
      return c.json(
        {
          status: "error",
          message: "Invalid JSON body.",
          e: JSON.stringify(e),
        },
        400,
      );
    }

    const newDbJobId = crypto.randomUUID();
    const initialJobRecord: InsertGeneratorPrompt = {
      id: newDbJobId,
      userId,
      status: "PENDING",
      inputPayload: clientInput,
    };

    try {
      await db.insert(generatorPrompts).values(initialJobRecord);
    } catch (dbInsertError: any) {
      console.error(
        `Failed to insert initial DB prompt record ${newDbJobId}: ${dbInsertError.message}`,
        dbInsertError,
      );
      return c.json({ status: "error", message: "Internal error recording prompt request." }, 500);
    }

    try {
      const runpod = runpodSdk(RUNPOD_API_KEY);
      const endpoint = runpod.endpoint(RUNPOD_GENERATOR_ID);
      const triggeredJob = await endpoint!.run({
        input: {
          job_type: "generate_prompt",
          data: {
            prompt: clientInput.prompt,
          },
        },
        webhook: `${RUNPOD_WEBHOOK_URL}/generator`,
      });

      if (!triggeredJob?.id) {
        const message = `RunPod endpoint.run did not return a job ID for DB prompt ${newDbJobId}.`;
        await db
          .update(generatorPrompts)
          .set({
            status: "FAILED",
            errorMessage: message,
            errorDetails: triggeredJob ?? null,
          })
          .where(eq(generatorPrompts.id, newDbJobId));
        return c.json({ status: "error", message: "Failed to trigger RunPod prompt job." }, 500);
      }

      await db
        .update(generatorPrompts)
        .set({
          runpodJobId: triggeredJob.id,
          status: "RUNNING",
        })
        .where(eq(generatorPrompts.id, newDbJobId));

      return c.json(
        {
          status: "accepted",
          message: "Prompt generation job initiated.",
          db_job_id: newDbJobId,
          runpod_job_id: triggeredJob.id,
        },
        202,
      );
    } catch (error: any) {
      await db
        .update(generatorPrompts)
        .set({
          status: "FAILED",
          errorMessage: `API Handler error during RunPod prompt triggering: ${error.message}`,
          errorDetails: {
            stack: error.stack,
            message: error.message,
          },
        })
        .where(eq(generatorPrompts.id, newDbJobId));

      return c.json(
        {
          status: "error",
          message: "Internal server error while initiating prompt job.",
        },
        500,
      );
    }
  })
  .get("/images", async (c) => {
    const db = c.get("db");
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ status: "error", message: "Authentication required." }, 401);
    }

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

    const queryParams = c.req.query();
    const limit = parseInt(queryParams.limit || "20", 10); // Default limit 20
    const offset = parseInt(queryParams.offset || "0", 10); // Default offset 0
    const statusFilter = queryParams.status || "COMPLETED"; // Default to COMPLETED

    // Basic validation
    if (isNaN(limit) || limit <= 0 || isNaN(offset) || offset < 0) {
      return c.json(
        {
          status: "error",
          message: "Invalid pagination parameters (limit, offset).",
        },
        400
      );
    }
    // Add validation for statusFilter if needed

    try {
      console.log(
        `Fetching images: limit=${limit}, offset=${offset}, status=${statusFilter}`
      );

      const jobs = await db.query.generatorJobs.findMany({
        limit,
        offset,
        where: (jobs, { eq, and, isNotNull }) =>
          and(eq(jobs.userId, userId), eq(jobs.status, statusFilter as any), isNotNull(jobs.status)),
        orderBy: (jobs, { desc }) => desc(jobs.createdAt),
      });

      console.log(
        `Fetched ${jobs.length} jobs for limit=${limit}, offset=${offset}.`
      );

      console.log(
        `Fetched ${jobs.length} jobs for limit=${limit}, offset=${offset}.`
      );

      // Determine if there's a next page using the limit/offset pattern
      const hasMore = jobs.length === limit;
      let nextPageUrl: string | null = null;

      if (hasMore) {
        const nextOffset = offset + limit;
        // Construct the URL for the next page based on the current request URL
        const currentUrl = new URL(c.req.url);
        currentUrl.searchParams.set("limit", limit.toString());
        currentUrl.searchParams.set("offset", nextOffset.toString());
        if (queryParams.status) {
          // Preserve status filter if present
          currentUrl.searchParams.set("status", queryParams.status);
        }
        // Add any other query parameters that should persist pagination
        nextPageUrl = currentUrl.toString();
        console.log("Calculated next page URL:", nextPageUrl);
      } else {
        console.log("No more pages.");
      }

      // Return the array of jobs for this page and the next page URL
      return c.json({
        status: "success",
        message: "Successfully fetched image generation jobs.",
        items: jobs, // Returning the job objects (each contains imageUrls array)
        nextPageUrl: nextPageUrl, // URL for the next page of jobs
      });
    } catch (error: any) {
      console.error(
        `API Handler unexpected error fetching generator jobs: ${error.message}`,
        error
      );

      return c.json(
        {
          status: "error",
          message: "Internal server error while fetching images.",
          error: error.message,
        },
        500
      );
    }
  })
  .delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const db = c.get("db");
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ status: "error", message: "Authentication required." }, 401);
      }
      const deletedCount = await db
        .delete(generatorJobs)
        .where(and(eq(generatorJobs.id, id), eq(generatorJobs.userId, userId)))
        .limit(1);
      return c.json(
        {
          status: "success",
          message: "Deleted successfully",
        },
        200
      );
    } catch (e) {
      return c.json(
        {
          status: "error",
          message: "Internal Server Error while deleting this id",
          error: e instanceof Error ? e?.message : JSON.stringify(e),
        },
        500
      );
    }
  })
  .get("/prompt-status/:id", async (c) => {
    const db = c.get("db");
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ status: "error", message: "Authentication required." }, 401);
    }

    if (!db) {
      return c.json(
        { status: "error", message: "Server configuration error: Database not available." },
        500,
      );
    }

    try {
      const id = c.req.param("id");
      const job = await db.query.generatorPrompts.findFirst({
        where: (prompts, { and, eq }) => and(eq(prompts.id, id), eq(prompts.userId, userId)),
      });

      if (!job) {
        return c.json({ status: "error", message: "Prompt generation job not found." }, 404);
      }

      return c.json({
        status: "success",
        message: "Successfully fetched prompt generation job status.",
        job: {
          id: job.id,
          status: job.status,
          outputPayload: job.outputPayload,
          errorMessage: job.errorMessage,
          errorDetails: job.errorDetails,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          completedAt: job.completedAt,
        },
      });
    } catch (error: any) {
      return c.json(
        {
          status: "error",
          message: "Internal server error while fetching prompt generation job status.",
          error: error.message,
        },
        500,
      );
    }
  });

export default generatorRouter;
