import { Elysia, t } from "elysia";
import { eq, and, desc, asc, not, or } from "drizzle-orm";
import { civitaiFiles, civitaiModels, civitaiModelVersions } from "@/schema";
import { fetchCivitaiModel, registerOrUpdateCivitaiModel } from "@/services/civitaiService";
import { Model } from "@/client/types/civitai";
import { ModelTypes } from "@/types/models";
import db from "@/db";

export const modelRouter = new Elysia({ prefix: "model" })
  .post(
    "/",
    async ({ body, set }) => {
      const { model: civitaiModelData, versionId, fileId, defaultDownload = false } = body;

      // Construct the environment config object required by the service function
      const envConfig = {
        RUNPOD_API_KEY: Bun.env.RUNPOD_API_KEY,
        RUNPOD_DOWNLOADER_ID: Bun.env.RUNPOD_DOWNLOADER_ID,
        RUNPOD_WEBHOOK_URL: Bun.env.RUNPOD_WEBHOOK_URL,
      };

      // Basic check for required env vars before proceeding with service function
      if (!envConfig.RUNPOD_API_KEY) {
        set.status = 500;
        return { error: "RUNPOD_API_KEY environment variable is not set." };
      }
      if (!envConfig.RUNPOD_DOWNLOADER_ID) {
        set.status = 500;
        return { error: "RUNPOD_DOWNLOADER_ID environment variable is not set." };
      }
      if (!envConfig.RUNPOD_WEBHOOK_URL) {
        set.status = 500;
        return { error: "RUNPOD_WEBHOOK_URL environment variable is not set." };
      }

      try {
        // Call the reusable function to handle registration and download initiation
        // Pass triggerDownload: true (which is the default)
        const result = await registerOrUpdateCivitaiModel(civitaiModelData, {
          fileId,
          versionId,
          triggerDownload: !defaultDownload,
        });

        // Return Elysia response based on the result
        if (result.status === "FAILED") {
          set.status = 500;
          return { error: result.message, details: result.errors };
        } else {
          set.status = 200; // Return 200 for both success and partial success
          return {
            message: result.message,
            status: result.status, // Could be SUCCESS or PARTIAL_SUCCESS
            runpodJobId: result.runpodJobId,
            civitaiId: result.id,
            dbModelId: result.dbModelId,
            errors: result.errors, // Include any non-critical errors
          };
        }
      } catch (error: any) {
        console.error("Unhandled error in POST / route handler:", error);
        set.status = 500;
        return { error: "An unexpected error occurred.", details: error.message };
      }
    },
    {
      body: t.Object({
        model: t.Object({
          id: t.Number(),
          name: t.String(),
          description: t.String(),
          allowNoCredit: t.Boolean(),
          allowCommercialUse: t.Array(t.String()),
          allowDerivatives: t.Boolean(),
          allowDifferentLicense: t.Boolean(),
          type: t.Union([
            t.Literal(ModelTypes.Checkpoint),
            t.Literal(ModelTypes.Controlnet),
            t.Literal(ModelTypes.TextualInversion),
            t.Literal(ModelTypes.Hypernetwork),
            t.Literal(ModelTypes.AestheticGradient),
            t.Literal(ModelTypes.LORA),
            t.Literal(ModelTypes.Poses),
          ]),
          minor: t.Boolean(),
          poi: t.Boolean(),
          nsfw: t.Boolean(),
          nsfwLevel: t.Number(),
          availability: t.String(),
          cosmetic: t.Union([t.Null(), t.Any()]), // Assuming 'null' or any other type
          supportsGeneration: t.Boolean(),
          stats: t.Object({
            downloadCount: t.Number(),
            favoriteCount: t.Number(),
            thumbsUpCount: t.Number(),
            thumbsDownCount: t.Number(),
            commentCount: t.Number(),
            ratingCount: t.Number(),
            rating: t.Number(),
            tippedAmountCount: t.Number(),
          }),
          creator: t.Object({
            username: t.String(),
            image: t.String(),
          }),
          tags: t.Array(t.String()),
          modelVersions: t.Array(
            t.Object({
              id: t.Number(),
              index: t.Number(),
              name: t.String(),
              baseModel: t.String(),
              baseModelType: t.Optional(t.String()),
              publishedAt: t.String(),
              availability: t.String(),
              nsfwLevel: t.Number(),
              description: t.Optional(t.String()),
              trainedWords: t.Optional(t.Array(t.String())),
              stats: t.Object({
                downloadCount: t.Number(),
                thumbsUpCount: t.Number(),
                ratingCount: t.Number(),
                rating: t.Number(),
              }),
              supportsGeneration: t.Optional(t.Boolean()),
              files: t.Array(
                t.Object({
                  id: t.Number(),
                  sizeKB: t.Number(),
                  name: t.String(),
                  type: t.String(),
                  pickleScanResult: t.String(),
                  pickleScanMessage: t.Union([t.String(), t.Null()]),
                  virusScanResult: t.String(),
                  virusScanMessage: t.Union([t.String(), t.Null()]),
                  scannedAt: t.String(),
                  metadata: t.Object({
                    format: t.String(),
                    size: t.Optional(t.Union([t.String(), t.Null()])),
                    fp: t.Optional(t.Union([t.String(), t.Null()])),
                  }),
                  hashes: t.Object({
                    AutoV1: t.Optional(t.String()),
                    AutoV2: t.String(),
                    SHA256: t.String(),
                    CRC32: t.String(),
                    BLAKE3: t.String(),
                    AutoV3: t.Optional(t.String()),
                  }),
                  downloadUrl: t.String(),
                  primary: t.Boolean(),
                })
              ),
              images: t.Array(
                t.Object({
                  url: t.String(),
                  nsfwLevel: t.Number(),
                  width: t.Number(),
                  height: t.Number(),
                  hash: t.String(),
                  type: t.String(),
                  hasMeta: t.Boolean(),
                  hasPositivePrompt: t.Boolean(),
                  onSite: t.Boolean(),
                  remixOfId: t.Union([t.Number(), t.Null()]),
                  meta: t.Union([t.Any(), t.Null()]),
                })
              ),
              downloadUrl: t.String(),
            })
          ),
        }),
        versionId: t.Number(),
        fileId: t.Number(),
        defaultDownload: t.Optional(t.Boolean()),
      }),
    }
  )
  .get("/", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (model, { asc }) => asc(model.createdAt),
        with: {
          creator: true,
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
      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error in GET / route handler:", error);
      set.status = 500;
      return { error: "Failed to process models", details: error.message };
    }
  })
  .get("/default", async ({ set }) => {
    try {
      const versions = await db.query.civitaiModelVersions.findMany({
        where: (version, { eq }) => eq(version.required, true),
        with: {
          files: true,
        },
      });

      set.status = 200;
      return {
        items: versions.flatMap((version) =>
          version.files.map((file) => ({
            url: file.downloadUrl,
            path: file.runpodPath,
          }))
        ),
      };
    } catch (error: any) {
      console.error("Error in GET /default route handler:", error);
      set.status = 500;
      return { error: "Failed to process models", details: error.message };
    }
  })
  .delete("", async ({ query, set }) => {
    const runpodDownloaderId = Bun.env.RUNPOD_DOWNLOADER_ID;
    const webhookUrl = Bun.env.RUNPOD_WEBHOOK_URL + "/downloader";

    // --- SECURITY CHECK: Require confirmation parameter ---
    const confirm = query.confirm;
    if (confirm !== "true") {
      console.warn("DELETE / rejected: Confirmation parameter missing or incorrect.");
      set.status = 400; // Bad Request
      return {
        error: "Confirmation required to delete all data. Add ?confirm=true to the URL.",
      };
    }

    try {
      const response = await fetch(`https://api.runpod.ai/v2/${runpodDownloaderId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Bun.env.RUNPOD_API_KEY}`,
        },
        body: JSON.stringify({
          input: {
            action: "deleteAll",
            save_path: "/runpod-volume/workspace/",
          },
          webhook: webhookUrl,
        }),
      });

      const runpodJob = await response.json();

      if (runpodJob.id) {
        console.log(`Deletion initiated for all files. RunPod Job ID: ${runpodJob.id}`);

        set.status = 200;
        return {
          message: "Deletion initiated for all files.",
          status: "IN_PROGRESS",
          runpodJobId: runpodJob.id,
        };
      } else {
        console.error("Failed to initiate Runpod deletion job:", runpodJob);
        set.status = 500;
        return { error: "Failed to initiate Runpod deletion job." };
      }
    } catch (error: any) {
      console.error("Error deleting all models and related data:", error);
      set.status = 500;
      return { error: "Failed to delete all models and related data." };
    }
  })
  .get("/checkpoints", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.Checkpoint),
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

      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching Checkpoints with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch Checkpoints with files and images" };
    }
  })
  .get("/textual-inversions", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.TextualInversion),
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

      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching Textual Inversions with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch Textual Inversions with files and images" };
    }
  })
  .get("/hypernetworks", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.Hypernetwork),
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

      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching Hypernetworks with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch Hypernetworks with files and images" };
    }
  })
  .get("/aesthetic-gradients", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.AestheticGradient),
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
      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching Aesthetic Gradients with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch Aesthetic Gradients with files and images" };
    }
  })
  .get("/loras", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.LORA),
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

      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching LoRAs with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch LoRAs with files and images" };
    }
  })
  .get("/controlnets", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.Controlnet),
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

      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching Controlnets with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch Controlnets with files and images" };
    }
  })
  .get("/poses", async ({ set }) => {
    try {
      const models = await db.query.civitaiModels.findMany({
        orderBy: (models, { asc }) => asc(models.createdAt),
        where: (models, { eq }) => eq(models.type, ModelTypes.Poses),
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

      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error fetching Poses with files and images:", error);
      set.status = 500;
      return { error: "Failed to fetch Poses with files and images" };
    }
  })
  .get("/:id", async ({ params, set }) => {
    try {
      const id = params.id;
      const [model] = await db
        .select()
        .from(civitaiModels)
        .where(and(or(eq(civitaiModels.id, Number(id))), not(eq(civitaiModels.status, "DELETED"))))
        .limit(1);

      if (model) {
        set.status = 200;
        return { message: "Model fetched successfully", model: model };
      } else {
        set.status = 404;
        return { message: `Model with ID ${id} not found` };
      }
    } catch (error: any) {
      console.error(`Error fetching model with ID ${params.id}:`, error);
      set.status = 500;
      return {
        message: `Failed to fetch model with ID ${params.id}`,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      };
    }
  })
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const id = params.id;
        const { defaultWeight: newWeight } = body;

        const updatedModelResult = await db
          .update(civitaiModels)
          .set({ defaultWeight: newWeight, updatedAt: new Date() })
          .where(eq(civitaiModels.id, Number(id)))
          .returning();

        if (updatedModelResult && updatedModelResult.length > 0) {
          set.status = 200;
          return {
            message: "Model weight updated successfully",
            model: updatedModelResult[0],
          };
        } else {
          set.status = 404;
          return { message: `Model with ID ${id} not found` };
        }
      } catch (error: any) {
        console.error(`Error updating model weight with ID ${params.id}:`, error);
        set.status = 500;
        return {
          message: `Failed to update model weight with ID ${params.id}`,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        };
      }
    },
    {
      body: t.Object({
        defaultWeight: t.Optional(t.Number()),
      }),
    }
  )
  .delete("/:id", async ({ params, set }) => {
    const id = params.id;
    const runpodDownloaderId = Bun.env.RUNPOD_DOWNLOADER_ID;
    const webhookUrl = Bun.env.RUNPOD_WEBHOOK_URL + "/downloader";

    if (!runpodDownloaderId) {
      set.status = 500;
      return { error: "RUNPOD_DOWNLOADER_ID environment variable is not set." };
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
        set.status = 404;
        return { message: `Model with ID ${id} not found` };
      }

      const latestVersion = model.modelVersions[0]; // Latest version is now the first one due to desc order
      if (!latestVersion || !latestVersion.files || latestVersion.files.length === 0) {
        set.status = 404;
        return { message: `No version or primary file found for model ID ${id}` };
      }
      const primaryFile = latestVersion.files[0];
      const runpodPath = latestVersion.files.at(0)?.runpodPath ?? null;

      if (!runpodPath) {
        set.status = 500;
        return { error: "Runpod path not found for the model file." };
      }

      // 2. Initiate Runpod task to delete the file
      try {
        const response = await fetch(`https://api.runpod.ai/v2/${runpodDownloaderId}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Bun.env.RUNPOD_API_KEY}`,
          },
          body: JSON.stringify({
            input: {
              action: "delete",
              save_path: runpodPath,
              model_id: model.id,
            },
            webhook: webhookUrl,
          }),
        });

        const runpodJob = await response.json();

        if (runpodJob.id) {
          console.log(`Deletion initiated for ${runpodPath} with RunPod job ID: ${runpodJob.id}`);

          set.status = 200;
          return {
            message: `Model with ID ${id} and associated files deletion initiated. Runpod Job ID: ${runpodJob.id}`,
            status: "IN_PROGRESS",
            runpodJobId: runpodJob.id,
            modelId: model.id,
            civitaiId: model.id,
          };
        } else {
          console.error("Failed to initiate Runpod deletion job:", runpodJob);
          set.status = 500;
          return { error: "Failed to initiate Runpod deletion job." };
        }
      } catch (runpodError: any) {
        console.error("Error initiating Runpod deletion job:", runpodError);
        set.status = 500;
        return { error: "Error initiating Runpod deletion job." };
      }
    } catch (dbError: any) {
      console.error("Error fetching model data for deletion:", dbError);
      set.status = 500;
      return { error: "Failed to fetch model data for deletion." };
    }
  });
