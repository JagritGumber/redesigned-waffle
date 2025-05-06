// ./v1/modelRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { civitaiFiles, civitaiModels, civitaiModelVersions } from "@/schema";
import { and, asc, desc, eq, not, or, sql } from "drizzle-orm";
import { civitaiImages } from "@/schema";
import runpodSdk from "runpod-sdk";
import {
  fetchCivitaiModel,
  registerOrUpdateCivitaiModel,
} from "@/services/civitaiService";
import { Model } from "@/client/types/civitai";
import { ModelTypes } from "@/types/models";

const modelRouter = new Hono<ContextForHono>()
  .post("/", async (c) => {
    const {
      model: civitaiModelData,
      versionId,
      fileId,
      defaultDownload = false,
    } = await c.req.json<{
      model: Model;
      versionId: number;
      fileId: number;
      defaultDownload?: boolean;
    }>(); // Use 'any' or your Model type
    const db = c.get("db");

    // Construct the environment config object required by the service function
    const envConfig = {
      RUNPOD_API_KEY: c.env.RUNPOD_API_KEY,
      RUNPOD_DOWNLOADER_ID: c.env.RUNPOD_DOWNLOADER_ID,
      RUNPOD_WEBHOOK_URL: c.env.RUNPOD_WEBHOOK_URL,
      // Add other necessary env vars here from c.env
    };

    // Basic check for required env vars before proceeding with service function
    if (!envConfig.RUNPOD_API_KEY) {
      return c.json(
        { error: "RUNPOD_API_KEY environment variable is not set." },
        500
      );
    }
    if (!envConfig.RUNPOD_DOWNLOADER_ID) {
      return c.json(
        { error: "RUNPOD_DOWNLOADER_ID environment variable is not set." },
        500
      );
    }
    if (!envConfig.RUNPOD_WEBHOOK_URL) {
      return c.json(
        { error: "RUNPOD_WEBHOOK_URL environment variable is not set." },
        500
      );
    }

    try {
      // Call the reusable function to handle registration and download initiation
      // Pass triggerDownload: true (which is the default)
      const result = await registerOrUpdateCivitaiModel(
        db,
        envConfig,
        civitaiModelData,
        {
          fileId,
          versionId,
          triggerDownload: !defaultDownload,
        }
      );

      // Return Hono response based on the result
      if (result.status === "FAILED") {
        return c.json({ error: result.message, details: result.errors }, 500);
      } else {
        return c.json(
          {
            message: result.message,
            status: result.status, // Could be SUCCESS or PARTIAL_SUCCESS
            runpodJobId: result.runpodJobId,
            civitaiId: result.id,
            dbModelId: result.dbModelId,
            errors: result.errors, // Include any non-critical errors
          },
          result.status === "PARTIAL_SUCCESS" ? 200 : 200
        ); // Return 200 for both success and partial success
        // Or perhaps 500 for partial success if you want clearer error reporting?
        // Decided to return 200 for partial success, just include errors in body.
      }
    } catch (error: any) {
      // This catch block handles errors *before* calling the function
      // or unexpected errors that might escape the function's error handling
      console.error("Unhandled error in POST / route handler:", error);
      return c.json(
        { error: "An unexpected error occurred.", details: error.message },
        500
      );
    }
  })
  .get("/", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        // where: (model, { eq, not }) => not(eq(model.status, "DELETED")),
        orderBy: (model, { asc }) => asc(model.createdAt),
        with: {
          modelVersions: {
            orderBy: (version, { desc }) => desc(version.publishedAt),
            with: {
              files: {
                orderBy: (file, { asc }) => asc(file.createdAt),
              },
              images: {
                orderBy: (image, { asc }) => asc(image.index),
              },
            },
          },
        },
      });

      console.log(`Returning ${models.length} models from the database.`);
      return c.json({ models }, 200);
    } catch (error: any) {
      console.error("Error in GET / route handler:", error);
      // Catch any errors from initial query or registration process
      return c.json(
        { error: "Failed to process models", details: error.message },
        500
      );
    }
  })
  .get("/default", async (c) => {
    try {
      const db = c.get("db");
      const versions = await db.query.civitaiModelVersions.findMany({
        where: (version, { eq }) => eq(version.required, true),
        with: {
          files: true,
        },
      });

      return c.json(
        {
          items: versions.flatMap((version) =>
            version.files.map((file) => ({
              url: file.downloadUrl,
              path: file.runpodPath,
            }))
          ),
        },
        200
      );
    } catch (error: any) {
      console.error("Error in GET / route handler:", error);
      // Catch any errors from initial query or registration process
      return c.json(
        { error: "Failed to process models", details: error.message },
        500
      );
    }
  })
  .delete("/", async (c) => {
    const runpodDownloaderId = c.env.RUNPOD_DOWNLOADER_ID;
    const runpod = runpodSdk(c.env.RUNPOD_API_KEY);
    const webhookUrl = c.env.RUNPOD_WEBHOOK_URL + "/downloader";
    const endpoint = runpod.endpoint(runpodDownloaderId);
    const db = c.get("db");

    // --- SECURITY CHECK: Require confirmation parameter ---
    const confirm = c.req.query("confirm");
    if (confirm !== "true") {
      console.warn(
        "DELETE / rejected: Confirmation parameter missing or incorrect."
      );
      return c.json(
        {
          error:
            "Confirmation required to delete all data. Add ?confirm=true to the URL.",
        },
        400 // Bad Request
      );
    }

    try {
      const runpodJob = await endpoint!.run({
        input: {
          action: "deleteAll",
          save_path: "/runpod-volume/workspace/",
        },
        webhook: webhookUrl,
      });

      if (runpodJob.id) {
        console.log(
          `Deletion initiated for all files. RunPod Job ID: ${runpodJob.id}`
        );

        return c.json(
          {
            message: "Deletion initiated for all files.",
            status: "IN_PROGRESS",
            runpodJobId: runpodJob.id,
          },
          200
        );
      } else {
        console.error("Failed to initiate Runpod deletion job:", runpodJob);
        return c.json(
          { error: "Failed to initiate Runpod deletion job." },
          500
        );
      }
    } catch (error) {
      console.error("Error deleting all models and related data:", error);
      return c.json(
        { error: "Failed to delete all models and related data." },
        500
      );
    }
  })
  .get("/checkpoints", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) =>
          eq(civitaiModels.type, ModelTypes.Checkpoint),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });

      return c.json({ models }, 200);
    } catch (error) {
      console.error("Error fetching Checkpoints with files and images:", error);
      return c.json(
        { error: "Failed to fetch Checkpoints with files and images" },
        500
      );
    }
  })
  .get("/textual-inversions", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) =>
          eq(civitaiModels.type, ModelTypes.TextualInversion),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });

      return c.json({ models }, 200);
    } catch (error) {
      console.error(
        "Error fetching Textual Inversions with files and images:",
        error
      );
      return c.json(
        { error: "Failed to fetch Textual Inversions with files and images" },
        500
      );
    }
  })
  .get("/hypernetworks", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) =>
          eq(civitaiModels.type, ModelTypes.Hypernetwork),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });

      return c.json({ models }, 200);
    } catch (error) {
      console.error(
        "Error fetching Hypernetworks with files and images:",
        error
      );
      return c.json(
        { error: "Failed to fetch Hypernetworks with files and images" },
        500
      );
    }
  })
  .get("/aesthetic-gradients", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) =>
          eq(civitaiModels.type, ModelTypes.AestheticGradient),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });
      return c.json({ models }, 200);
    } catch (error) {
      console.error(
        "Error fetching Aesthetic Gradients with files and images:",
        error
      );
      return c.json(
        { error: "Failed to fetch Aesthetic Gradients with files and images" },
        500
      );
    }
  })
  .get("/loras", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(civitaiModels.type, ModelTypes.LORA),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });

      return c.json({ models }, 200);
    } catch (error) {
      console.error("Error fetching LoRAs with files and images:", error);
      return c.json(
        { error: "Failed to fetch LoRAs with files and images" },
        500
      );
    }
  })
  .get("/controlnets", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) =>
          eq(civitaiModels.type, ModelTypes.Controlnet),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });

      return c.json({ models }, 200);
    } catch (error) {
      console.error("Error fetching Controlnets with files and images:", error);
      return c.json(
        { error: "Failed to fetch Controlnets with files and images" },
        500
      );
    }
  })
  .get("/poses", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(civitaiModels.type, ModelTypes.Poses),
        with: {
          modelVersions: {
            with: {
              files: {
                orderBy: (files, { asc }) => asc(files.createdAt),
              },
              images: {
                orderBy: (images, { asc }) => asc(images.index),
              },
            },
          },
        },
      });

      return c.json({ models }, 200);
    } catch (error) {
      console.error("Error fetching Poses with files and images:", error);
      return c.json(
        { error: "Failed to fetch Poses with files and images" },
        500
      );
    }
  })
  .get("/:id", async (c) => {
    try {
      const db = c.get("db");
      const id = c.req.param("id");
      const [model] = await db
        .select()
        .from(civitaiModels)
        .where(
          and(
            or(eq(civitaiModels.id, Number(id))),
            not(eq(civitaiModels.status, "DELETED"))
          )
        )
        .limit(1);

      if (model) {
        return c.json(
          { message: "Model fetched successfully", model: model },
          200
        );
      } else {
        return c.json({ message: `Model with ID ${id} not found` }, 404);
      }
    } catch (error) {
      console.error(
        `Error fetching model with ID ${c.req.param("id")}:`,
        error
      );
      return c.json(
        {
          message: `Failed to fetch model with ID ${c.req.param("id")}`,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        },
        500
      );
    }
  })
  .patch("/:id", async (c) => {
    try {
      const db = c.get("db");
      const id = c.req.param("id");
      const body = await c.req.json<{ defaultWeight: number }>();
      const newWeight = body.defaultWeight;

      const updatedModelResult = await db
        .update(civitaiModels)
        .set({ defaultWeight: newWeight, updatedAt: new Date() })
        .where(eq(civitaiModels.id, Number(id)))
        .returning();

      if (updatedModelResult && updatedModelResult.length > 0) {
        return c.json(
          {
            message: "Model weight updated successfully",
            model: updatedModelResult[0],
          },
          200
        );
      } else {
        return c.json({ message: `Model with ID ${id} not found` }, 404);
      }
    } catch (error) {
      console.error(
        `Error updating model weight with ID ${c.req.param("id")}:`,
        error
      );
      return c.json(
        {
          message: `Failed to update model weight with ID ${c.req.param("id")}`,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        },
        500
      );
    }
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const runpodDownloaderId = c.env.RUNPOD_DOWNLOADER_ID;
    const runpod = runpodSdk(c.env.RUNPOD_API_KEY);
    const webhookUrl = c.env.RUNPOD_WEBHOOK_URL + "/downloader";
    const endpoint = runpod.endpoint(runpodDownloaderId);

    if (!runpodDownloaderId) {
      return c.json(
        { error: "RUNPOD_DOWNLOADER_ID environment variable is not set." },
        500
      );
    }

    try {
      // 1. Fetch the model, latest version, and primary file to get runpodPath
      const model = await db.query.civitaiModels.findFirst({
        where: (civitaiModels, { eq, or }) => eq(civitaiModels.id, Number(id)),
        with: {
          modelVersions: {
            orderBy: (versions, { desc }) => desc(versions.publishedAt),
            with: {
              files: {
                orderBy: (files, { desc }) => desc(files.createdAt),
              },
            },
          },
        },
      });

      if (!model) {
        return c.json({ message: `Model with ID ${id} not found` }, 404);
      }

      const latestVersion = model.modelVersions[0]; // Latest version is now the first one due to desc order
      if (
        !latestVersion ||
        !latestVersion.files ||
        latestVersion.files.length === 0
      ) {
        return c.json(
          { message: `No version or primary file found for model ID ${id}` },
          404
        );
      }
      const primaryFile = latestVersion.files[0];
      const runpodPath = latestVersion.files.at(0)?.runpodPath ?? null;

      if (!runpodPath) {
        return c.json(
          { error: "Runpod path not found for the model file." },
          500
        );
      }

      // 2. Initiate Runpod task to delete the file
      try {
        const runpodJob = await endpoint!.run({
          input: {
            action: "delete",
            save_path: runpodPath,
            model_id: model.id,
          },
          webhook: webhookUrl,
        });

        if (runpodJob.id) {
          console.log(
            `Deletion initiated for ${runpodPath} with RunPod job ID: ${runpodJob.id}`
          );

          return c.json(
            {
              message: `Model with ID ${id} and associated files deletion initiated. Runpod Job ID: ${runpodJob.id}`,
              status: "IN_PROGRESS",
              runpodJobId: runpodJob.id,
              modelId: model.id,
              civitaiId: model.id,
            },
            200
          );
        } else {
          console.error("Failed to initiate Runpod deletion job:", runpodJob);
          return c.json(
            { error: "Failed to initiate Runpod deletion job." },
            500
          );
        }
      } catch (runpodError) {
        console.error("Error initiating Runpod deletion job:", runpodError);
        return c.json({ error: "Error initiating Runpod deletion job." }, 500);
      }
    } catch (dbError) {
      console.error("Error fetching model data for deletion:", dbError);
      return c.json({ error: "Failed to fetch model data for deletion." }, 500);
    }
  });

export default modelRouter;
