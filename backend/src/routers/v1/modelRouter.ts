// ./v1/modelRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { civitaiFiles, civitaiModels, civitaiModelVersions } from "@/schema";
import { eq } from "drizzle-orm";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { Model } from "@/client/types/civitai";
import { InsertCivitaiModel } from "@/schema/models";

const modelRouter = new Hono<ContextForHono>()
  .post("/", async (c) => {
    const modelId = c.req.param("modelId");
    const civitaiApiToken = c.env.API_TOKEN;
    const db = c.get("db");
    const civitaiApiUrl = `https://civitai.com/api/v1/models/${modelId}?token=${civitaiApiToken}&nsfw=true`;

    if (!civitaiApiToken) {
      return c.json(
        { error: "CIVITAI_API_TOKEN environment variable is not set." },
        500
      );
    }

    try {
      const response = await fetch(civitaiApiUrl);
      if (!response.ok) {
        console.error(
          `Failed to fetch model with ID ${modelId} from Civitai: ${response.status} ${response.statusText}`
        );
        return c.json(
          { error: `Failed to fetch model with ID ${modelId} from Civitai.` },
          response.status as ContentfulStatusCode
        );
      }
      const civitaiModelData = (await response.json()) as Model;

      const {
        id: civitaiId,
        name,
        description,
        allowNoCredit,
        allowCommercialUse,
        allowDerivatives,
        allowDifferentLicense,
        type,
        nsfw,
        nsfwLevel,
        availability,
        supportsGeneration,
        creator,
        tags,
        modelVersions,
      } = civitaiModelData;

      try {
        // 1. Save/Update to civitaiModels table
        const [savedCivitaiModel] = await db
          .insert(civitaiModels)
          .values({
            civitaiId,
            name,
            description,
            allowNoCredit,
            allowCommercialUse: JSON.stringify(allowCommercialUse),
            allowDerivatives,
            allowDifferentLicense,
            type,
            nsfw,
            nsfwLevel,
            availability,
            supportsGeneration: supportsGeneration,
            creatorUsername: creator.username,
            tags: JSON.stringify(tags),
          } satisfies InsertCivitaiModel)
          .onConflictDoUpdate({
            target: civitaiModels.civitaiId,
            set: {
              name,
              description,
              allowNoCredit: allowNoCredit ? true : false,
              allowCommercialUse: JSON.stringify(allowCommercialUse),
              allowDerivatives: allowDerivatives ? true : false,
              allowDifferentLicense: allowDifferentLicense ? true : false,
              type,
              nsfw: nsfw ? true : false,
              nsfwLevel,
              availability,
              supportsGeneration: supportsGeneration ? true : false,
              creatorUsername: creator.username,
              tags: JSON.stringify(tags),
              updatedAt: new Date(),
            },
          })
          .returning();

        if (savedCivitaiModel) {
          // 2. Save/Update model versions
          for (const version of modelVersions) {
            const {
              id: civitaiVersionId,
              index,
              name: versionName,
              baseModel,
              baseModelType,
              publishedAt,
              availability: versionAvailability,
              nsfwLevel: versionNsfwLevel,
              description: versionDescription,
              trainedWords,
              supportsGeneration: versionSupportsGeneration,
              downloadUrl: versionDownloadUrl,
              files,
              // stats: we are ignoring this
            } = version;

            const [savedCivitaiModelVersion] = await db
              .insert(civitaiModelVersions)
              .values({
                civitaiModelId: savedCivitaiModel.id,
                civitaiVersionId,
                index,
                name: versionName,
                baseModel,
                baseModelType,
                publishedAt,
                availability: versionAvailability,
                nsfwLevel: versionNsfwLevel,
                description: versionDescription,
                trainedWords: JSON.stringify(trainedWords),
                supportsGeneration: versionSupportsGeneration,
                downloadUrl: versionDownloadUrl,
              })
              .onConflictDoUpdate({
                target: civitaiModelVersions.civitaiVersionId,
                set: {
                  index,
                  name: versionName,
                  baseModel,
                  baseModelType,
                  publishedAt,
                  availability: versionAvailability,
                  nsfwLevel: versionNsfwLevel,
                  description: versionDescription,
                  trainedWords: JSON.stringify(trainedWords),
                  supportsGeneration: versionSupportsGeneration,
                  downloadUrl: versionDownloadUrl,
                  updatedAt: new Date(),
                },
              })
              .returning();

            if (savedCivitaiModelVersion) {
              // 3. Save/Update files for each version
              for (const file of files) {
                const {
                  id: civitaiFileId,
                  name: fileName,
                  type: fileType,
                  sizeKB,
                  pickleScanResult,
                  pickleScanMessage,
                  virusScanResult,
                  virusScanMessage,
                  scannedAt,
                  metadata,
                  hashes,
                  downloadUrl: fileDownloadUrl,
                  primary,
                } = file;

                // Define the path where you will store the model on Runpod volume
                const runpodPath = `/workspace/${savedCivitaiModel.type}/${savedCivitaiModel.name.replace(
                  /[^a-zA-Z0-9]/g,
                  "_"
                )}/${versionName?.replace(
                  /[^a-zA-Z0-9]/g,
                  "_"
                )}/${fileName.replace(/[^a-zA-Z0-9]/g, "_")}`; // Sanitize names for file paths

                await db
                  .insert(civitaiFiles)
                  .values({
                    civitaiVersionId: savedCivitaiModelVersion.id,
                    civitaiFileId,
                    name: fileName,
                    type: fileType,
                    sizeKB,
                    pickleScanResult,
                    pickleScanMessage,
                    virusScanResult,
                    virusScanMessage,
                    scannedAt,
                    metadataFormat: metadata?.format,
                    metadataSize: metadata?.size,
                    metadataFp: metadata?.fp,
                    sha256Hash: hashes?.SHA256,
                    downloadUrl: fileDownloadUrl,
                    primary: primary ? true : false,
                    runpodPath,
                  })
                  .onConflictDoUpdate({
                    target: civitaiFiles.civitaiFileId,
                    set: {
                      name: fileName,
                      type: fileType,
                      sizeKB,
                      pickleScanResult,
                      pickleScanMessage,
                      virusScanResult,
                      virusScanMessage,
                      scannedAt,
                      metadataFormat: metadata?.format,
                      metadataSize: metadata?.size,
                      metadataFp: metadata?.fp,
                      sha256Hash: hashes?.SHA256,
                      downloadUrl: fileDownloadUrl,
                      primary: primary ? true : false,
                      runpodPath,
                      updatedAt: new Date(),
                    },
                  })
                  .returning();
              }
            }
          }

          return c.json(
            { message: `Model with ID ${modelId} saved successfully.` },
            200
          );
        } else {
          return c.json(
            { error: `Failed to save model with ID ${modelId}.` },
            500
          );
        }
      } catch (error) {
        console.error("Error saving model data to database:", error);
        return c.json({ error: "Failed to save model data to database." }, 500);
      }
    } catch (error) {
      console.error("Error fetching data from Civitai API:", error);
      return c.json({ error: "Failed to fetch data from Civitai API." }, 500);
    }
  })
  .get("/", async (c) => {
    try {
      const db = c.get("db");
      const allModels = await db.select().from(civitaiModels);

      if (allModels && allModels.length > 0) {
        return c.json(
          { message: "Models fetched successfully", models: allModels },
          200
        );
      } else {
        return c.json({ message: "No models found" }, 200); // Or 404
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      return c.json(
        {
          message: "Failed to fetch models",
          error: error instanceof Error ? error.message : JSON.stringify(error),
        },
        500
      );
    }
  })
  .get("/:id", async (c) => {
    try {
      const db = c.get("db");
      const id = c.req.param("id");
      const model = await db
        .select()
        .from(civitaiModels)
        .where(eq(civitaiModels.id, id));

      if (model && model.length > 0) {
        return c.json(
          { message: "Model fetched successfully", model: model[0] },
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
  });

export default modelRouter;
