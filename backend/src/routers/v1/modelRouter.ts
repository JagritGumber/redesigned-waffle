// ./v1/modelRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { civitaiFiles, civitaiModelInstalls, civitaiModels, civitaiModelVersions } from "@/schema";
import { and, asc, desc, eq, inArray, isNull, not, or, sql } from "drizzle-orm";
import { civitaiImages } from "@/schema";
import runpodSdk from "runpod-sdk";
import {
  fetchCivitaiModel,
  registerOrUpdateCivitaiModel,
} from "@/services/civitaiService";
import { isModelImageRebuildConfigured } from "@/services/modelImageBuildService";
import { Model } from "@/client/types/civitai";
import { ModelTypes } from "@/types/models";
import { verifyAuth } from "@hono/auth-js";
import { getRequiredUserId } from "@/utils/auth";

async function getInstalledModelIds(db: any, userId: string) {
  const installs = await db
    .select()
    .from(civitaiModelInstalls)
    .where(eq(civitaiModelInstalls.userId, userId));

  return {
    installs,
    ids: installs.map((install: any) => install.civitaiModelId),
    byModelId: new Map(installs.map((install: any) => [install.civitaiModelId, install])),
  };
}

function applyInstallState<T extends { id: number }>(models: T[], installByModelId: Map<number, any>) {
  return models.map((model) => {
    const install = installByModelId.get(model.id);
    return {
      ...model,
      defaultWeight: install?.defaultWeight ?? (model as any).defaultWeight ?? 0.6,
      status: install?.status ?? null,
      runpodJobId: install?.runpodJobId ?? null,
      civitaiFileId: install?.civitaiFileId ?? null,
      runpodPath: install?.runpodPath ?? null,
      statusMessage: install?.statusMessage ?? null,
      buildTriggerId: install?.buildTriggerId ?? null,
      imageName: install?.imageName ?? null,
      downloadCompletedAt: install?.downloadCompletedAt ?? null,
      buildTriggeredAt: install?.buildTriggeredAt ?? null,
      deployedAt: install?.deployedAt ?? null,
    };
  });
}

async function getInstalledModels(db: any, userId: string, type?: ModelTypes) {
  const { ids, byModelId } = await getInstalledModelIds(db, userId);
  if (ids.length === 0) return [];

  const models = await db.query.civitaiModels.findMany({
    orderBy: (models: any, { asc }: any) => asc(models.createdAt),
    where: (models: any, { and, eq, inArray, isNull, not, or }: any) =>
      and(
        inArray(models.id, ids),
        type ? eq(models.type, type) : undefined,
        eq(models.nsfw, false),
        or(isNull(models.status), not(eq(models.status, "DELETED"))),
      ),
    with: {
      modelVersions: {
        with: {
          files: {
            orderBy: (files: any, { asc }: any) => asc(files.createdAt),
          },
          images: {
            orderBy: (images: any, { asc }: any) => asc(images.index),
          },
        },
      },
    },
  });

  return applyInstallState(models, byModelId);
}

const modelRouter = new Hono<ContextForHono>()
  .use("*", verifyAuth())
  .post("/", async (c) => {
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ error: "Authentication required." }, 401);
    }
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
      MODEL_IMAGE_REBUILD_PROVIDER: c.env.MODEL_IMAGE_REBUILD_PROVIDER,
    };

    const usesModelImageRebuild = isModelImageRebuildConfigured(envConfig);

    // Worker-hosted installs use the legacy downloader endpoint; manager handles private mirror builds.
    if (!usesModelImageRebuild && !envConfig.RUNPOD_API_KEY) {
      return c.json(
        { error: "RUNPOD_API_KEY environment variable is not set." },
        500
      );
    }
    if (!usesModelImageRebuild && !envConfig.RUNPOD_DOWNLOADER_ID) {
      return c.json(
        { error: "RUNPOD_DOWNLOADER_ID environment variable is not set." },
        500
      );
    }
    if (!usesModelImageRebuild && !envConfig.RUNPOD_WEBHOOK_URL) {
      return c.json(
        { error: "RUNPOD_WEBHOOK_URL environment variable is not set." },
        500
      );
    }

    try {
      if (civitaiModelData.nsfw || civitaiModelData.nsfwLevel > 1) {
        return c.json(
          {
            error:
              "This studio only accepts safe-for-work models. Choose a general-audience model to download.",
          },
          400
        );
      }

      // Call the reusable function to handle registration and download initiation
      // Pass triggerDownload: true (which is the default)
      const result = await registerOrUpdateCivitaiModel(
        db,
        envConfig,
        civitaiModelData,
        {
          fileId,
          versionId,
          userId,
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
            installStatus: result.installStatus,
            statusMessage: result.statusMessage,
            buildTriggerId: result.buildTriggerId,
            civitaiFileId: result.civitaiFileId,
            imageName: result.imageName,
            runpodPath: result.runpodPath,
            downloadCompletedAt: result.downloadCompletedAt,
            buildTriggeredAt: result.buildTriggeredAt,
            deployedAt: result.deployedAt,
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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const { ids, byModelId } = await getInstalledModelIds(db, userId);
      if (ids.length === 0) {
        return c.json({ models: [] }, 200);
      }

      const models = await db.query.civitaiModels.findMany({
        // where: (model, { eq, not }) => not(eq(model.status, "DELETED")),
        orderBy: (model, { asc }) => asc(model.createdAt),
        where: (model, { and, eq, inArray, isNull, not, or }) =>
          and(
            inArray(model.id, ids),
            eq(model.nsfw, false),
            or(isNull(model.status), not(eq(model.status, "DELETED"))),
          ),
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
      return c.json({ models: applyInstallState(models, byModelId) }, 200);
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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const { ids } = await getInstalledModelIds(db, userId);
      if (ids.length === 0) {
        return c.json({ items: [] }, 200);
      }

      const models = await db.query.civitaiModels.findMany({
        where: (model, { inArray }) => inArray(model.id, ids),
        with: {
          modelVersions: {
            where: (version, { eq }) => eq(version.required, true),
            with: {
              files: true,
            },
          },
        },
      });
      const versions = models.flatMap((model) => model.modelVersions);

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
    const db = c.get("db");
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ error: "Authentication required." }, 401);
    }

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
      await db.delete(civitaiModelInstalls).where(eq(civitaiModelInstalls.userId, userId));

      return c.json(
        {
          message: "Removed all installed models for this account.",
          status: "COMPLETED",
        },
        200
      );
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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.Checkpoint);

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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.TextualInversion);

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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.Hypernetwork);

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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.AestheticGradient);
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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.LORA);

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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.Controlnet);

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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required." }, 401);
      }
      const models = await getInstalledModels(db, userId, ModelTypes.Poses);

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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ message: "Authentication required." }, 401);
      }
      const id = c.req.param("id");
      const [install] = await db
        .select()
        .from(civitaiModelInstalls)
        .where(
          and(
            eq(civitaiModelInstalls.userId, userId),
            eq(civitaiModelInstalls.civitaiModelId, Number(id)),
          )
        )
        .limit(1);

      if (!install) {
        return c.json({ message: `Model with ID ${id} not found for this account` }, 404);
      }

      const [model] = await db
        .select()
        .from(civitaiModels)
        .where(
          and(
            eq(civitaiModels.id, Number(id)),
            eq(civitaiModels.nsfw, false),
            or(isNull(civitaiModels.status), not(eq(civitaiModels.status, "DELETED")))
          )
        )
        .limit(1);

      if (model) {
        return c.json(
          { message: "Model fetched successfully", model: applyInstallState([model], new Map([[Number(id), install]]))[0] },
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
      const userId = getRequiredUserId(c);
      if (!userId) {
        return c.json({ message: "Authentication required." }, 401);
      }
      const id = c.req.param("id");
      const body = await c.req.json<{ defaultWeight: number }>();
      const newWeight = body.defaultWeight;

      const updatedModelResult = await db
        .update(civitaiModelInstalls)
        .set({ defaultWeight: newWeight, updatedAt: new Date() })
        .where(
          and(
            eq(civitaiModelInstalls.civitaiModelId, Number(id)),
            eq(civitaiModelInstalls.userId, userId),
          )
        )
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
    const userId = getRequiredUserId(c);
    if (!userId) {
      return c.json({ error: "Authentication required." }, 401);
    }
    try {
      const deleted = await db
        .delete(civitaiModelInstalls)
        .where(
          and(
            eq(civitaiModelInstalls.userId, userId),
            eq(civitaiModelInstalls.civitaiModelId, Number(id)),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        return c.json({ message: `Model with ID ${id} not found` }, 404);
      }

      return c.json(
        {
          message: `Model with ID ${id} removed from this account.`,
          status: "SUCCESS",
        },
        200,
      );
    } catch (dbError) {
      console.error("Error removing model install:", dbError);
      return c.json({ error: "Failed to remove model from this account." }, 500);
    }
  });

export default modelRouter;
