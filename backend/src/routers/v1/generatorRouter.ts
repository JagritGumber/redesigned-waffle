import { Hono } from "hono";
import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { eq } from "drizzle-orm";
import { generatorJobs, InsertGeneratorJob } from "@/schema";

import runpodSdk from "runpod-sdk";
import { ContextForHono } from "@/types/context";

// const VolumePath = Type.String({
//   pattern: "^/(runpod-volume|defaults)/.*",
//   errorMessage: {
//     pattern: "Path must start with /runpod-volume/ or /defaults/",
//   },
// });

// const LoRAItemSchema = Type.Object({
//   local_path: VolumePath,
//   weight: Type.Optional(Type.Number({ default: 1.0 })),
// });

// const TIItemSchema = Type.Object({
//   local_path: VolumePath,
// });

// const ModelConfigSchema = Type.Object({
//   local_path: VolumePath,

//   model_type: Type.Union([
//     Type.Literal("SDXL 1.0"),
//     Type.Literal("SD 1.5"),
//     Type.Literal("Illustrious"),
//     Type.Literal("Pony"),
//   ]),
// });

// const GeneratorArgsSchema = Type.Optional(
//   Type.Object({
//     num_inference_steps: Type.Optional(Type.Integer({ default: 25 })),
//     guidance_scale: Type.Optional(Type.Number({ default: 7.0 })),
//     height: Type.Optional(Type.Integer()),
//     width: Type.Optional(Type.Integer()),
//     negative_prompt: Type.Optional(Type.String()),
//   })
// );

// const GeneratorInputPayloadSchema = Type.Object({
//   prompt: Type.String({
//     minLength: 1,
//     errorMessage: { minLength: "Prompt is required." },
//   }),
//   model_conf: ModelConfigSchema,
//   loras: Type.Optional(Type.Array(LoRAItemSchema)),
//   textual_inversions: Type.Optional(Type.Array(TIItemSchema)),
//   generator_args: GeneratorArgsSchema,
// });

// type RunPodWorkerPayload = Static<typeof GeneratorInputPayloadSchema>;

const generatorRouter = new Hono<ContextForHono>().post(
  "/generate",
  async (c) => {
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

    let clientInput: any;
    try {
      clientInput = await c.req.json();
    } catch (e: any) {
      console.error(`Failed to parse request body as JSON: ${e.message}`);
      return c.json({ status: "error", message: "Invalid JSON body." }, 400);
    }

    // const isValid = Value.Check(GeneratorInputPayloadSchema, clientInput);
    // if (!isValid) {
    //   const errors = [
    //     ...Value.Errors(GeneratorInputPayloadSchema, clientInput),
    //   ];
    //   console.error("Input validation failed:", errors);
    //   const formattedErrors = errors.map((err) => ({
    //     path: err.path,
    //     message: err.message,
    //     value: err.value,
    //   }));
    //   return c.json(
    //     {
    //       status: "error",
    //       message: "Invalid input payload",
    //       errors: formattedErrors,
    //     },
    //     400
    //   );
    // }

    // const workerPayload: RunPodWorkerPayload = Value.Default(
    //   GeneratorInputPayloadSchema,
    //   clientInput
    // ) as RunPodWorkerPayload;

    const newDbJobId = crypto.randomUUID();
    const initialJobRecord: InsertGeneratorJob = {
      id: newDbJobId,
      status: "PENDING",
      inputPayload: JSON.stringify(clientInput),
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

      const triggeredJob = await endpoint!.run({
        input: clientInput,
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
);

export default generatorRouter;
