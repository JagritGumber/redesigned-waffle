import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import {
  generatorJobs,
  InsertGeneratorJob,
  generatorPrompts,
  InsertGeneratorPrompt,
} from "@/schema"; // Assuming schema path is relative to manager/src
import { Value } from "@sinclair/typebox/value";
import {
  GenerateRequestPayload,
  GenerateRequestPayloadType,
  GeneratePromptRequestPayload,
  GeneratePromptRequestPayloadType,
} from "@/validators/generation"; // Assuming validators path is relative to manager/src
import db from "@/db";
import runpodSdk from "runpod-sdk";

export const generatorRouter = new Elysia({ prefix: "/generator" })
  .post(
    "/generate-image",
    async ({ body, set }) => {
      const { RUNPOD_API_KEY, RUNPOD_GENERATOR_ID, RUNPOD_WEBHOOK_URL } = Bun.env;

      if (!RUNPOD_API_KEY || !RUNPOD_GENERATOR_ID || !RUNPOD_WEBHOOK_URL || !db) {
        console.error(
          "Server configuration error: Missing required environment variables or database binding."
        );
        set.status = 500;
        return {
          status: "error",
          message: "Server configuration error: Required resources not available.",
        };
      }

      let clientInput: GenerateRequestPayloadType;
      try {
        clientInput = body; // Elysia automatically parses JSON body
        Value.Assert(GenerateRequestPayload, clientInput);
      } catch (e: any) {
        console.error(`Failed to parse request body as JSON: ${e.message}`);
        set.status = 400;
        return {
          status: "error",
          message: "Invalid JSON body.",
          e: JSON.stringify(e),
        };
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

      const checkpointPromise = db.query.civitaiModels.findFirst({
        where: (model: any, { eq }: any) => eq(model.id, checkpoint.modelId),
        with: {
          modelVersions: {
            where: (version: any, { eq }: any) => eq(version.id, checkpoint.modelVersionId),
            with: {
              files: true,
            },
          },
        },
      });

      const loraPromises = loras.map((lora: any) =>
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

      const ttiPromises = textualInversions.map((tti: any) =>
        db.query.civitaiModels.findFirst({
          where: (model: any, { eq }: any) => eq(model.id, tti.modelId),
          with: {
            modelVersions: {
              where: (version: any, { eq }: any) => eq(version.id, tti.modelVersionId),
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
        .filter((item) => item.trim().length !== 0 && item.trim() !== "undefined");

      const negativePromptTokenArray = negativePrompt
        .split(",")
        .filter((item) => item.trim().length !== 0 && item.trim() !== "undefined");

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
          (tti) =>
            `${tti!
              .modelVersions!.at(0)!
              .files!.at(0)!
              .runpodPath!.split("/")
              .at(-1)
              ?.split(".")
              .at(0)}`
        );

      const negativeTtiTokenArray = ttiModels
        .filter((_tti: any, index: number) => textualInversions[index].type === "positive")
        .map(
          (tti: any, index: number) =>
            `${tti!
              .modelVersions!.at(0)!
              .files!.at(0)!
              .runpodPath!.split("/")
              .at(-1)
              ?.split(".")
              .at(0)}`
        );

      const fullPrompt = [...promptTokenArray, ...loraTokenArray, ...positiveTtiTokenArray].join(
        ", "
      );

      const fullNegativePrompt = [...negativePromptTokenArray, ...negativeTtiTokenArray].join(", ");

      const modifiedPayload = {
        job_type: "generate_image", // Added job_type
        data: {
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
        },
      };

      const newDbJobId = crypto.randomUUID();
      const initialJobRecord: InsertGeneratorJob = {
        id: newDbJobId,
        status: "PENDING",
        inputPayload: clientInput,
      };

      try {
        await db.insert(generatorJobs).values(initialJobRecord);
        console.log(`Created DB job record: ${newDbJobId} (Status: PENDING)`);
      } catch (e: any) {
        console.error(`Failed to insert initial DB job record ${newDbJobId}: ${e.message}`, e);
        set.status = 500;
        return { status: "error", message: "Internal error recording job request." };
      }

      let runpodJobId: string | undefined = undefined;

      try {
        console.log(
          `Triggering RunPod generator worker ${RUNPOD_GENERATOR_ID} for DB job ${newDbJobId}...`
        );

        const webhookUrl = `${RUNPOD_WEBHOOK_URL}/generator`;
        console.log(`Setting webhook URL for RunPod job: ${webhookUrl}`);
        console.log(clientInput);

        const runpod = runpodSdk(Bun.env.RUNPOD_API_KEY);
        const endpoint = runpod.endpoint(Bun.env.RUNPOD_GENERATOR_ID);
        const triggeredJob = await endpoint?.run({
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
          await db.update(generatorJobs).set(updateData).where(eq(generatorJobs.id, newDbJobId));
          console.log(
            `DB job record ${newDbJobId} updated with RunPod ID ${runpodJobId} and status RUNNING.`
          );

          set.status = 202;
          return {
            status: "accepted",
            message: "Image generation job initiated.",
            db_job_id: newDbJobId,
            runpod_job_id: runpodJobId,
          };
        } else {
          const msg = `RunPod endpoint.run did not return a job ID for DB job ${newDbJobId}.`;
          console.error(msg, triggeredJob);

          const updateData: Partial<InsertGeneratorJob> = {
            status: "FAILED",
            errorMessage: msg,
            errorDetails: JSON.stringify(triggeredJob),
          };

          await db.update(generatorJobs).set(updateData).where(eq(generatorJobs.id, newDbJobId));

          set.status = 500;
          return { status: "error", message: "Failed to trigger RunPod job." };
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
          await db.update(generatorJobs).set(updateData).where(eq(generatorJobs.id, newDbJobId));
          console.log(
            `DB job record ${newDbJobId} updated to FAILED after API handler error during triggering.`
          );
        } catch (dbUpdateError: any) {
          console.error(
            `Failed to update DB job record ${newDbJobId} to FAILED after handler error: ${dbUpdateError.message}`,
            dbUpdateError
          );
        }

        set.status = 500;
        return {
          status: "error",
          message: "Internal server error while initiating job.",
        };
      }
    },
    {
      body: GenerateRequestPayload,
    }
  )
  .post(
    "/generate-prompt",
    async ({ body, set }) => {
      const { RUNPOD_API_KEY, RUNPOD_GENERATOR_ID, RUNPOD_WEBHOOK_URL } = Bun.env;

      if (!RUNPOD_API_KEY || !RUNPOD_GENERATOR_ID || !RUNPOD_WEBHOOK_URL || !db) {
        console.error(
          "Server configuration error: Missing required environment variables or database binding."
        );
        set.status = 500;
        return {
          status: "error",
          message: "Server configuration error: Required resources not available.",
        };
      }

      let clientInput: GeneratePromptRequestPayloadType;
      try {
        clientInput = body;
        Value.Assert(GeneratePromptRequestPayload, clientInput);
      } catch (e: any) {
        console.error(`Failed to parse request body as JSON: ${e.message}`);
        set.status = 400;
        return {
          status: "error",
          message: "Invalid JSON body.",
          e: JSON.stringify(e),
        };
      }

      const newDbJobId = crypto.randomUUID();
      const initialJobRecord: InsertGeneratorPrompt = {
        id: newDbJobId,
        status: "PENDING",
        inputPayload: clientInput satisfies GeneratePromptRequestPayloadType,
      };

      try {
        await db.insert(generatorPrompts).values(initialJobRecord);
        console.log(`Created DB prompt record: ${newDbJobId} (Status: PENDING)`);
      } catch (dbInsertError: any) {
        console.error(
          `Failed to insert initial DB prompt record ${newDbJobId}: ${dbInsertError.message}`,
          dbInsertError
        );
        set.status = 500;
        return { status: "error", message: "Internal error recording prompt request." };
      }

      let runpodJobId: string | undefined = undefined;

      try {
        console.log(
          `Triggering RunPod generator worker ${RUNPOD_GENERATOR_ID} for DB prompt ${newDbJobId}...`
        );

        const webhookUrl = `${RUNPOD_WEBHOOK_URL}/generator`;
        console.log(`Setting webhook URL for RunPod prompt: ${webhookUrl}`);
        console.log(clientInput);

        const runpod = runpodSdk(Bun.env.RUNPOD_API_KEY);
        const endpoint = runpod.endpoint(Bun.env.RUNPOD_GENERATOR_ID);
        const triggeredJob = await endpoint?.run({
          input: {
            job_type: "generate_prompt", // Added job_type
            data: {
              prompt: clientInput.prompt,
            },
          },
          webhook: webhookUrl,
        });

        if (triggeredJob?.id) {
          runpodJobId = triggeredJob.id;
          console.log(
            `RunPod job triggered successfully. RunPod Job ID: ${runpodJobId} for DB job ${newDbJobId}`
          );

          const updateData: Partial<InsertGeneratorPrompt> = {
            runpodJobId: runpodJobId,
            status: "RUNNING",
          };
          await db
            .update(generatorPrompts)
            .set(updateData)
            .where(eq(generatorPrompts.id, newDbJobId));
          console.log(
            `DB prompt record ${newDbJobId} updated with RunPod ID ${runpodJobId} and status RUNNING.`
          );

          set.status = 202;
          return {
            status: "accepted",
            message: "Prompt generation job initiated.",
            db_job_id: newDbJobId,
            runpod_job_id: runpodJobId,
          };
        } else {
          const msg = `RunPod endpoint.run did not return a job ID for DB prompt ${newDbJobId}.`;
          console.error(msg, triggeredJob);

          const updateData: Partial<InsertGeneratorPrompt> = {
            status: "FAILED",
            errorMessage: msg,
            errorDetails: JSON.stringify(triggeredJob),
          };

          await db
            .update(generatorPrompts)
            .set(updateData)
            .where(eq(generatorPrompts.id, newDbJobId));

          set.status = 500;
          return { status: "error", message: "Failed to trigger RunPod job." };
        }
      } catch (error: any) {
        console.error(
          `API Handler unexpected error during RunPod job triggering for DB prompt ${newDbJobId}: ${error.message}`,
          error
        );

        const updateData: Partial<InsertGeneratorPrompt> = {
          status: "FAILED",
          errorMessage: `API Handler error during RunPod triggering: ${error.message}`,
          errorDetails: JSON.stringify({
            stack: error.stack,
            message: error.message,
          }),
        };

        try {
          await db
            .update(generatorPrompts)
            .set(updateData)
            .where(eq(generatorPrompts.id, newDbJobId));
          console.log(
            `DB prompt record ${newDbJobId} updated to FAILED after API handler error during triggering.`
          );
        } catch (dbUpdateError: any) {
          console.error(
            `Failed to update DB prompt record ${newDbJobId} to FAILED after handler error: ${dbUpdateError.message}`,
            dbUpdateError
          );
        }

        set.status = 500;
        return {
          status: "error",
          message: "Internal server error while initiating job.",
        };
      }
    },
    {
      body: t.Object({
        prompt: t.String(),
      }),
    }
  )
  .get("/images", async ({ query, set }) => {
    if (!db) {
      console.error("Server configuration error: Database binding not available.");
      set.status = 500;
      return {
        status: "error",
        message: "Server configuration error: Database not available.",
      };
    }

    const limit = Number.parseInt(query.limit || "20", 10); // Default limit 20
    const offset = Number.parseInt(query.offset || "0", 10); // Default offset 0
    const statusFilter = query.status || "COMPLETED"; // Default to COMPLETED

    // Basic validation
    if (Number.isNaN(limit) || limit <= 0 || Number.isNaN(offset) || offset < 0) {
      set.status = 400;
      return {
        status: "error",
        message: "Invalid pagination parameters (limit, offset).",
      };
    }
    // Add validation for statusFilter if needed

    try {
      console.log(`Fetching images: limit=${limit}, offset=${offset}, status=${statusFilter}`);

      const jobs = await db.query.generatorJobs.findMany({
        limit,
        offset,
        where: (jobs: any, { eq, and, isNotNull }: any) =>
          and(eq(jobs.status, statusFilter as any), isNotNull(jobs.status)),
        orderBy: (jobs: any, { desc }: any) => desc(jobs.createdAt),
      });

      console.log(`Fetched ${jobs.length} jobs for limit=${limit}, offset=${offset}.`);

      console.log(`Fetched ${jobs.length} jobs for limit=${limit}, offset=${offset}.`);

      // Determine if there's a next page using the limit/offset pattern
      const hasMore = jobs.length === limit;
      let nextPageUrl: string | null = null;

      if (hasMore) {
        const nextOffset = offset + limit;
        nextPageUrl = `/api/v1/generator/images?limit=${limit}&offset=${nextOffset}${
          query.status ? `&status=${query.status}` : ""
        }`;
        console.log("Calculated next page URL:", nextPageUrl);
      } else {
        console.log("No more pages.");
      }

      set.status = 200;
      return {
        status: "success",
        message: "Successfully fetched image generation jobs.",
        items: jobs, // Returning the job objects (each contains imageUrls array)
        nextPageUrl: nextPageUrl, // URL for the next page of jobs
      };
    } catch (error: any) {
      console.error(
        `API Handler unexpected error fetching generator jobs: ${error.message}`,
        error
      );

      set.status = 500;
      return {
        status: "error",
        message: "Internal server error while fetching images.",
        error: error.message,
      };
    }
  })
  .delete(
    "/:id",
    async ({
      params,
      set,
      db,
    }: {
      params: { id: string };
      set: { status: number | undefined }; // Corrected type for set.status
      db: any; // Replace 'any' with your actual Drizzle DB type
      env: {
        RUNPOD_API_KEY: string;
        RUNPOD_GENERATOR_ID: string;
        RUNPOD_WEBHOOK_URL: string;
        R2: any; // Replace 'any' with your R2 bucket type
        R2_PUBLIC_BUCKET_URL: string;
      };
    }) => {
      try {
        const id = params.id;
        const deletedCount = await db
          .delete(generatorJobs)
          .where(eq(generatorJobs.id, id))
          .limit(1);
        set.status = 200;
        return {
          status: "success",
          message: "Deleted successfully",
        };
      } catch (e: any) {
        set.status = 500;
        return {
          status: "error",
          message: "Internal Server Error while deleting this id",
          error: e instanceof Error ? e?.message : JSON.stringify(e),
        };
      }
    }
  )
  .get("/prompt-status/:id", async ({ params, set }) => {
    if (!db) {
      console.error("Server configuration error: Database binding not available.");
      set.status = 500;
      return {
        status: "error",
        message: "Server configuration error: Database not available.",
      };
    }

    try {
      const { id } = params;
      const job = await db.query.generatorPrompts.findFirst({
        where: (prompts, { eq }) => eq(prompts.id, id),
      });

      if (!job) {
        set.status = 404;
        return { status: "error", message: "Prompt generation job not found." };
      }

      set.status = 200;
      return {
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
      };
    } catch (error: any) {
      console.error(
        `API Handler unexpected error fetching prompt generation job status: ${error.message}`,
        error
      );
      set.status = 500;
      return {
        status: "error",
        message: "Internal server error while fetching prompt generation job status.",
        error: error.message,
      };
    }
  });
