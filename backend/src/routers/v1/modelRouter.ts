// ./v1/modelRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { civitaiFiles, civitaiModels, civitaiModelVersions } from "@/schema";
import { and, asc, desc, eq, not, or, sql } from "drizzle-orm";
import { civitaiImages } from "@/schema/models";
import runpodSdk from "runpod-sdk";
import {
  fetchCivitaiModel,
  registerOrUpdateCivitaiModel,
} from "@/services/civitaiService";

const REQUIRED_MODEL_IDS = [
  8762, 22428, 59525, 572670, 383163, 448716, 869634, 448770, 348620, 521384,
  369943, 626419, 723963, 900346, 903161, 112170, 732013, 113516, 583686,
  589918, 512070, 579218, 577378, 668558, 482572, 518864,
];

const modelRouter = new Hono<ContextForHono>()
  .post("/", async (c) => {
    const { model: civitaiModelData } = await c.req.json<{ model: any }>(); // Use 'any' or your Model type
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
        civitaiModelData
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
            civitaiId: result.civitaiId,
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

      // Construct the environment config object required by the service function
      const envConfig = {
        RUNPOD_API_KEY: c.env.RUNPOD_API_KEY,
        RUNPOD_DOWNLOADER_ID: c.env.RUNPOD_DOWNLOADER_ID,
        RUNPOD_WEBHOOK_URL: c.env.RUNPOD_WEBHOOK_URL,
        // Add other necessary env vars here from c.env
      };

      // Basic check for required env vars before proceeding
      if (
        !envConfig.RUNPOD_API_KEY ||
        !envConfig.RUNPOD_DOWNLOADER_ID ||
        !envConfig.RUNPOD_WEBHOOK_URL
      ) {
        console.error(
          "Missing required RunPod environment variables for service function."
        );
        // Decide if you want to fail the GET request or just log a warning
        // Let's log a warning and proceed without registration attempts
      }

      // 1. Get the list of required model IDs that are *already* in the DB
      const existingModels = await db.query.civitaiModels.findMany({
        where: (model, { inArray }) =>
          inArray(model.civitaiId, REQUIRED_MODEL_IDS), // Use civitaiId here
        columns: {
          civitaiId: true, // Only fetch the civitaiId column
        },
      });

      const existingModelIds = new Set(
        existingModels.map((model) => model.civitaiId)
      );

      // 2. Identify the missing required model IDs
      const missingModelIds = REQUIRED_MODEL_IDS.filter(
        (id) => !existingModelIds.has(id)
      );

      console.log(`Required model IDs: ${REQUIRED_MODEL_IDS.join(", ")}`);
      console.log(
        `Existing model IDs from required list: ${Array.from(
          existingModelIds
        ).join(", ")}`
      );

      // 3. Fetch and insert missing models using the exported function
      if (missingModelIds.length > 0) {
        console.log(
          `Found ${missingModelIds.length} missing required models. Attempting to register...`
        );
        console.log(`Missing IDs: ${missingModelIds.join(", ")}`);

        // Use Promise.all to fetch and register concurrently
        const registrationPromises = missingModelIds.map(async (modelId) => {
          try {
            // First, fetch the model data from Civitai API
            const civitaiData = await fetchCivitaiModel(
              modelId,
              c.env.API_TOKEN
            );

            if (civitaiData) {
              // Then, use the reusable function to register the model data
              // Pass triggerDownload: false because we only want to register metadata here,
              // not initiate downloads during a GET request. The downloader worker
              // should pick these up based on their status ('PENDING_REGISTRATION').
              return await registerOrUpdateCivitaiModel(
                db,
                envConfig,
                civitaiData,
                { triggerDownload: false }
              );
            } else {
              // fetchCivitaiModel already logged the error
              return {
                civitaiId: modelId,
                status: "FAILED",
                message: "Failed to fetch data from Civitai API.",
              };
            }
          } catch (error: any) {
            console.error(
              `Unhandled error during registration attempt for model ${modelId}:`,
              error
            );
            return {
              civitaiId: modelId,
              status: "FAILED",
              message: `Unhandled registration error: ${error.message}`,
            };
          }
        });

        const registrationResults = await Promise.all(registrationPromises);
        console.log("Registration attempts completed:", registrationResults);

        // You could inspect registrationResults to see which models failed to register
        // and potentially include this information in the response or logs.
      } else {
        console.log("All required models are already in the database.");
      }

      // 4. Perform the original query to get all relevant models (including newly added ones)
      const models = await db.query.civitaiModels.findMany({
        where: (model, { eq, not }) => not(eq(model.status, "DELETED")),
        orderBy: (model, { asc }) => asc(model.createdAt), // Ordering by creation date
        with: {
          versions: {
            orderBy: (version, { desc }) => desc(version.publishedAt), // Order versions by published date
            with: {
              files: {
                orderBy: (file, { asc }) => asc(file.createdAt), // Or fileId, or name
              },
              images: {
                orderBy: (image, { asc }) => asc(image.index), // Assuming 'index' for image order
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
        .where(eq(civitaiModels.type, "Checkpoint"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
        .where(eq(civitaiModels.type, "TextualInversion"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
        .where(eq(civitaiModels.type, "Hypernetwork"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
        .where(eq(civitaiModels.type, "AestheticGradient"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
        .where(eq(civitaiModels.type, "LORA"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
        .where(eq(civitaiModels.type, "Controlnet"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
        .where(eq(civitaiModels.type, "Poses"))
        .orderBy(
          asc(civitaiModels.createdAt),
          asc(civitaiModelVersions.createdAt),
          asc(civitaiImages.index)
        );

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
      const [model] = await db
        .select()
        .from(civitaiModels)
        .where(
          and(
            or(
              eq(civitaiModels.id, id),
              eq(civitaiModels.civitaiId, Number(id))
            ),
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
        .where(
          or(eq(civitaiModels.id, id), eq(civitaiModels.civitaiId, Number(id)))
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
        where: (civitaiModels, { eq, or }) =>
          or(eq(civitaiModels.id, id), eq(civitaiModels.civitaiId, Number(id))),
        with: {
          versions: {
            orderBy: (versions, { desc }) => desc(versions.createdAt),
            with: {
              files: {
                orderBy: (files, { desc }) => desc(files.createdAt),
                where: (files, { eq }) => eq(files.primary, true),
              },
            },
          },
        },
      });

      if (!model) {
        return c.json({ message: `Model with ID ${id} not found` }, 404);
      }

      const latestVersion = model.versions[0]; // Latest version is now the first one due to desc order
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
      const runpodPath = primaryFile?.runpodPath;

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
              civitaiId: model.civitaiId,
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
