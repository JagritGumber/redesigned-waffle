// ./v1/modelRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { civitaiFiles, civitaiModels, civitaiModelVersions } from "@/schema";
import { eq } from "drizzle-orm";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { Model } from "@/client/types/civitai";
import {
  civitaiImages,
  InsertCivitaiImage,
  InsertCivitaiModel,
} from "@/schema/models";
import { sha256 } from "hono/utils/crypto";

const modelRouter = new Hono<ContextForHono>()
  .post("/", async (c) => {
    const { modelId } = await c.req.json<{ modelId: string }>();
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
              images, // Get the images array
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
                const runpodPath = `/workspace/${
                  savedCivitaiModel.type
                }/${savedCivitaiModel.name.replace(
                  /[^a-zA-Z0-9._-]/g,
                  "_"
                )}/${versionName?.replace(
                  /[^a-zA-Z0-9._-]/g,
                  "_"
                )}/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`; // Sanitize names for file paths

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

              // 4. Save/Update images for each version
              for (const image of images) {
                const {
                  url,
                  nsfwLevel: imageNsfwLevel,
                  width,
                  height,
                  hash,
                  type: imageType,
                  hasMeta,
                  hasPositivePrompt,
                  onSite,
                  remixOfId,
                } = image;

                await db
                  .insert(civitaiImages)
                  .values({
                    civitaiVersionId: savedCivitaiModelVersion.id,
                    url,
                    nsfwLevel: imageNsfwLevel,
                    width,
                    height,
                    hash,
                    type: imageType,
                    hasMeta: hasMeta,
                    hasPositivePrompt: hasPositivePrompt,
                    onSite: onSite,
                    remixOfId,
                  } satisfies InsertCivitaiImage)
                  .onConflictDoUpdate({
                    target: civitaiImages.id,
                    set: {
                      url,
                      nsfwLevel: imageNsfwLevel,
                      width,
                      height,
                      hash,
                      type: imageType,
                      hasMeta: hasMeta,
                      hasPositivePrompt: hasPositivePrompt,
                      onSite: onSite,
                      remixOfId,
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
  .get("/checkpoints", async (c) => {
    try {
      const db = c.get("db");
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "Checkpoint"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "TextualInversion"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "Hypernetwork"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "AestheticGradient"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "LORA"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "Controlnet"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
      const results = await db
        .select({
          model: civitaiModels,
          version: civitaiModelVersions,
          file: civitaiFiles,
          image: civitaiImages, // Select the image data
        })
        .from(civitaiModels)
        .innerJoin(
          civitaiModelVersions,
          eq(civitaiModels.id, civitaiModelVersions.civitaiModelId)
        )
        .innerJoin(
          civitaiFiles,
          eq(civitaiModelVersions.id, civitaiFiles.civitaiVersionId)
        )
        .innerJoin(
          civitaiImages, // Join with the images table
          eq(civitaiModelVersions.id, civitaiImages.civitaiVersionId) // Assuming the join is on civitaiVersionId
        )
        .where(eq(civitaiModels.type, "Poses"));

      const modelsMap = new Map();

      for (const row of results) {
        const model = row.model;
        const version = row.version;
        const file = row.file;
        const image = row.image; // Get the image data

        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, { ...model, versions: new Map() });
        }

        const modelEntry = modelsMap.get(model.id);

        if (!modelEntry.versions.has(version.id)) {
          modelEntry.versions.set(version.id, {
            ...version,
            files: [],
            images: [],
          }); // Initialize images array
        }

        const versionEntry = modelEntry.versions.get(version.id);
        versionEntry.files.push(file);
        versionEntry.images.push(image); // Add the image to the version
      }

      const models = Array.from(modelsMap.values()).map((modelEntry) => ({
        ...modelEntry,
        versions: Array.from(modelEntry.versions.values()),
      }));

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
