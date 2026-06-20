import { Elysia, t } from "elysia";
import { and, eq, not } from "drizzle-orm";
import { civitaiModelInstalls, civitaiModels, civitaiModelVersions } from "@/schema";
import { registerOrUpdateCivitaiModel } from "@/services/civitaiService";
import { ModelTypes } from "@/types/models";
import { requireUserId } from "@/utils/auth";
import db from "@/db";

const modelTypesByRoute: Record<string, ModelTypes> = {
  checkpoints: ModelTypes.Checkpoint,
  "textual-inversions": ModelTypes.TextualInversion,
  hypernetworks: ModelTypes.Hypernetwork,
  "aesthetic-gradients": ModelTypes.AestheticGradient,
  loras: ModelTypes.LORA,
  controlnets: ModelTypes.Controlnet,
  poses: ModelTypes.Poses,
};

async function getInstalledModelIds(userId: string) {
  const installs = await db
    .select()
    .from(civitaiModelInstalls)
    .where(eq(civitaiModelInstalls.userId, userId));

  return {
    installs,
    ids: installs.map((install) => install.civitaiModelId),
    byModelId: new Map(installs.map((install) => [install.civitaiModelId, install])),
  };
}

function applyInstallState<T extends { id: number }>(
  models: T[],
  installByModelId: Map<number, typeof civitaiModelInstalls.$inferSelect>,
) {
  return models.map((model) => {
    const install = installByModelId.get(model.id);
    return {
      ...model,
      defaultWeight:
        install?.defaultWeight ?? ("defaultWeight" in model ? model.defaultWeight : 0.6),
      status: install?.status ?? ("status" in model ? model.status : null),
      runpodJobId: install?.runpodJobId ?? ("runpodJobId" in model ? model.runpodJobId : null),
      civitaiFileId: install?.civitaiFileId ?? null,
      runpodPath: install?.runpodPath ?? null,
      statusMessage: install?.statusMessage ?? null,
      buildTriggerId: install?.buildTriggerId ?? null,
      downloadCompletedAt: install?.downloadCompletedAt ?? null,
      buildTriggeredAt: install?.buildTriggeredAt ?? null,
      deployedAt: install?.deployedAt ?? null,
    };
  });
}

async function getInstalledModels(userId: string, type?: ModelTypes) {
  const { ids, byModelId } = await getInstalledModelIds(userId);
  if (ids.length === 0) return [];

  const models = await db.query.civitaiModels.findMany({
    orderBy: (model, { asc }) => asc(model.createdAt),
    where: (model, { and, eq, inArray, not }) =>
      and(
        inArray(model.id, ids),
        eq(model.nsfw, false),
        type ? eq(model.type, type) : undefined,
        not(eq(model.status, "DELETED")),
      ),
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

  return applyInstallState(models, byModelId);
}

export const modelRouter = new Elysia({ prefix: "model" })
  .post(
    "/",
    async ({ body, request, set }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { error: "Authentication required." };

      const { model: civitaiModelData, versionId, fileId, defaultDownload = false } = body;

      try {
        if (civitaiModelData.nsfw || civitaiModelData.nsfwLevel > 1) {
          set.status = 400;
          return {
            error:
              "This studio only accepts safe-for-work models. Choose a general-audience model to download.",
          };
        }

        const result = await registerOrUpdateCivitaiModel(civitaiModelData, {
          userId,
          fileId,
          versionId,
          triggerDownload: !defaultDownload,
        });

        if (result.status === "FAILED") {
          set.status = 500;
          return { error: result.message, details: result.errors };
        }

        const [install] = await db
          .select()
          .from(civitaiModelInstalls)
          .where(
            and(
              eq(civitaiModelInstalls.userId, userId),
              eq(civitaiModelInstalls.civitaiModelId, result.dbModelId ?? result.id),
            ),
          )
          .limit(1);

        set.status = 200;
        return {
          message: result.message,
          status: result.status,
          installStatus: install?.status ?? null,
          statusMessage: install?.statusMessage ?? null,
          buildTriggerId: install?.buildTriggerId ?? null,
          runpodJobId: result.runpodJobId,
          civitaiId: result.id,
          dbModelId: result.dbModelId,
          errors: result.errors,
        };
      } catch (error: any) {
        console.error("Unhandled error in POST /model route handler:", error);
        set.status = 500;
        return { error: "An unexpected error occurred.", details: error.message };
      }
    },
    {
      body: t.Object({
        model: t.Any(),
        versionId: t.Number(),
        fileId: t.Number(),
        defaultDownload: t.Optional(t.Boolean()),
      }),
    },
  )
  .get("/", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    try {
      const models = await getInstalledModels(userId);
      set.status = 200;
      return { models };
    } catch (error: any) {
      console.error("Error in GET /model route handler:", error);
      set.status = 500;
      return { error: "Failed to process models", details: error.message };
    }
  })
  .get("/default", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    try {
      const { ids } = await getInstalledModelIds(userId);
      if (ids.length === 0) {
        set.status = 200;
        return { items: [] };
      }

      const versions = await db.query.civitaiModelVersions.findMany({
        where: (version, { and, eq, inArray }) =>
          and(eq(version.required, true), inArray(version.civitaiModelId, ids)),
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
          })),
        ),
      };
    } catch (error: any) {
      console.error("Error in GET /model/default route handler:", error);
      set.status = 500;
      return { error: "Failed to process models", details: error.message };
    }
  })
  .delete("", async ({ query, request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    if (query.confirm !== "true") {
      set.status = 400;
      return {
        error: "Confirmation required to remove your installed models. Add ?confirm=true to the URL.",
      };
    }

    await db.delete(civitaiModelInstalls).where(eq(civitaiModelInstalls.userId, userId));
    set.status = 200;
    return {
      message: "Removed all installed models for this account.",
      status: "SUCCESS",
    };
  })
  .get("/checkpoints", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute.checkpoints);
    set.status = 200;
    return { models };
  })
  .get("/textual-inversions", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute["textual-inversions"]);
    set.status = 200;
    return { models };
  })
  .get("/hypernetworks", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute.hypernetworks);
    set.status = 200;
    return { models };
  })
  .get("/aesthetic-gradients", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute["aesthetic-gradients"]);
    set.status = 200;
    return { models };
  })
  .get("/loras", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute.loras);
    set.status = 200;
    return { models };
  })
  .get("/controlnets", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute.controlnets);
    set.status = 200;
    return { models };
  })
  .get("/poses", async ({ request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    const models = await getInstalledModels(userId, modelTypesByRoute.poses);
    set.status = 200;
    return { models };
  })
  .get("/:id", async ({ params, request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    try {
      const id = Number(params.id);
      const [install] = await db
        .select()
        .from(civitaiModelInstalls)
        .where(
          and(eq(civitaiModelInstalls.userId, userId), eq(civitaiModelInstalls.civitaiModelId, id)),
        )
        .limit(1);

      if (!install) {
        set.status = 404;
        return { message: `Model with ID ${id} not found for this account` };
      }

      const [model] = await db
        .select()
        .from(civitaiModels)
        .where(
          and(
            eq(civitaiModels.id, id),
            eq(civitaiModels.nsfw, false),
            not(eq(civitaiModels.status, "DELETED")),
          ),
        )
        .limit(1);

      if (!model) {
        set.status = 404;
        return { message: `Model with ID ${id} not found` };
      }

      set.status = 200;
      return {
        message: "Model fetched successfully",
        model: applyInstallState([model], new Map([[id, install]]))[0],
      };
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
    async ({ params, body, request, set }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { error: "Authentication required." };

      try {
        const id = Number(params.id);
        const { defaultWeight: newWeight } = body;

        const updatedInstall = await db
          .update(civitaiModelInstalls)
          .set({ defaultWeight: newWeight, updatedAt: new Date() })
          .where(
            and(
              eq(civitaiModelInstalls.userId, userId),
              eq(civitaiModelInstalls.civitaiModelId, id),
            ),
          )
          .returning();

        if (updatedInstall.length > 0) {
          set.status = 200;
          return {
            message: "Model weight updated successfully",
            model: updatedInstall[0],
          };
        }

        set.status = 404;
        return { message: `Model with ID ${id} not found for this account` };
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
    },
  )
  .delete("/:id", async ({ params, request, set }) => {
    const userId = await requireUserId(request, set as any);
    if (!userId) return { error: "Authentication required." };

    try {
      const id = Number(params.id);
      const deleted = await db
        .delete(civitaiModelInstalls)
        .where(
          and(eq(civitaiModelInstalls.userId, userId), eq(civitaiModelInstalls.civitaiModelId, id)),
        )
        .returning();

      if (deleted.length === 0) {
        set.status = 404;
        return { message: `Model with ID ${id} not found for this account` };
      }

      set.status = 200;
      return {
        message: `Model with ID ${id} removed from this account.`,
        status: "SUCCESS",
      };
    } catch (error: any) {
      console.error("Error removing model install:", error);
      set.status = 500;
      return { error: "Failed to remove model from this account." };
    }
  });
