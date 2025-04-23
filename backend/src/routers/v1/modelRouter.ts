// ./v1/modelRouter.ts
import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import { civitaiFiles, civitaiModels, civitaiModelVersions } from "@/schema";
import { and, asc, desc, eq, not, or, sql } from "drizzle-orm";
import { Model } from "@/client/types/civitai";
import {
  civitaiImages,
  InsertCivitaiFile,
  InsertCivitaiImage,
  InsertCivitaiModel,
  InsertCivitaiModelVersion,
} from "@/schema/models";
import runpodSdk from "runpod-sdk";
import { BatchItem } from "drizzle-orm/batch";

const modelRouter = new Hono<ContextForHono>()
  .post("/", async (c) => {
    const { model: civitaiModelData } = await c.req.json<{ model: Model }>();
    const civitaiApiToken = c.env.API_TOKEN; // Not used in the POST, but keep check
    const runpodDownloaderId = c.env.RUNPOD_DOWNLOADER_ID;
    const rawWebhookUrl = c.env.RUNPOD_WEBHOOK_URL; // Get raw URL
    const db = c.get("db");

    // Environment variable checks moved upfront
    if (!c.env.RUNPOD_API_KEY) {
      return c.json(
        { error: "RUNPOD_API_KEY environment variable is not set." },
        500
      );
    }
    if (!runpodDownloaderId) {
      return c.json(
        { error: "RUNPOD_DOWNLOADER_ID environment variable is not set." },
        500
      );
    }
    if (!rawWebhookUrl) {
      return c.json(
        { error: "RUNPOD_WEBHOOK_URL environment variable is not set." },
        500
      );
    }
    // Construct the full webhook URL path
    const webhookUrl = `${rawWebhookUrl}/downloader`;

    // Initialize RunPod SDK *after* checks
    const runpod = runpodSdk(c.env.RUNPOD_API_KEY);
    const endpoint = runpod.endpoint(runpodDownloaderId);

    let runpodJobId: string | undefined = undefined; // Initialize nullable job ID
    let finalStatus: "IN_PROGRESS" | "ERROR" | "SAVED" = "SAVED"; // Default status if no download initiated
    let finalMessage: string = `Model ${civitaiModelData.id} data saved successfully.`;

    try {
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

      // --- 1. Save/Update to civitaiModels table ---
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
          target: civitaiModels.civitaiId, // Target the unique Civitai ID
          set: {
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
            supportsGeneration,
            creatorUsername: creator.username,
            tags: JSON.stringify(tags),
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!savedCivitaiModel) {
        console.error(
          `Failed to save or update model with Civitai ID ${civitaiId}.`
        );
        return c.json(
          {
            error: `Failed to save model with ID ${civitaiId}.`,
            status: "ERROR",
          },
          500
        );
      }

      // Sort model versions by publishedAt to get the latest
      const latestVersion = modelVersions.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )[0];

      if (!latestVersion) {
        console.warn(
          `No versions found for model Civitai ID ${civitaiId}. Cannot save version, files, or images.`
        );
        // Still return success for saving the model itself, but indicate no version data processed
        return c.json(
          {
            message: `Model ${civitaiId} data saved, but no versions found in the payload.`,
            status: "SAVED",
            civitaiId: civitaiId,
          },
          200
        );
      }

      // --- 2. Save/Update to civitaiModelVersions table (for the latest version) ---
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
        images,
      } = latestVersion;

      const [savedCivitaiModelVersion] = await db
        .insert(civitaiModelVersions)
        .values({
          civitaiModelId: savedCivitaiModel.id, // Link to internal model ID
          civitaiVersionId, // Use Civitai Version ID as unique target
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
        } satisfies InsertCivitaiModelVersion)
        .onConflictDoUpdate({
          target: civitaiModelVersions.civitaiVersionId, // Target the unique Civitai Version ID
          set: {
            index,
            name,
            baseModel,
            baseModelType,
            publishedAt,
            availability: versionAvailability,
            nsfwLevel: versionNsfwLevel,
            description: versionDescription,
            trainedWords: JSON.stringify(trainedWords),
            supportsGeneration: versionSupportsGeneration,
            downloadUrl: versionDownloadUrl,
          },
        })
        .returning();

      if (!savedCivitaiModelVersion) {
        console.error(
          `Failed to save or update version with Civitai ID ${civitaiVersionId}.`
        );
        // Return success for model save, but indicate version failure
        return c.json(
          {
            message: `Model ${civitaiId} data saved, but failed to save/update version ${civitaiVersionId}.`,
            status: "ERROR", // Indicate partial error
            civitaiId: civitaiId,
          },
          500
        ); // Return 500 as version is crucial
      }

      // --- 3. Save/Update primary file for the latest version ---
      const primaryFile = files.find((file) => file.primary);
      let savedCivitaiFile = null; // Keep track of the saved primary file for RunPod update

      if (primaryFile) {
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
        } = primaryFile;

        // Define the path where you will store the model on Runpod volume
        // Sanitize names - IMPROVEMENT: Maybe centralize this logic
        const sanitizedModelName = savedCivitaiModel.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );
        const sanitizedVersionName =
          versionName?.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

        const runpodPath = `/runpod-volume/workspace/${savedCivitaiModel.type}/${sanitizedModelName}/${sanitizedVersionName}/${sanitizedFileName}`;

        [savedCivitaiFile] = await db
          .insert(civitaiFiles)
          .values({
            civitaiVersionId: savedCivitaiModelVersion.id, // Link to internal version ID
            civitaiFileId, // Use Civitai File ID as unique target
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
          } satisfies InsertCivitaiFile)
          .onConflictDoUpdate({
            target: civitaiFiles.civitaiFileId, // Target the unique Civitai File ID
            set: {
              civitaiVersionId: sql`excluded.civitaiVersionId`, // Link to the current version
              name: sql`excluded.name`,
              type: sql`excluded.type`,
              sizeKB: sql`excluded.sizeKB`,
              pickleScanResult: sql`excluded.pickleScanResult`,
              pickleScanMessage: sql`excluded.pickleScanMessage`,
              virusScanResult: sql`excluded.virusScanResult`,
              virusScanMessage: sql`excluded.virusScanMessage`,
              scannedAt: sql`excluded.scannedAt`,
              metadataFormat: sql`excluded.metadataFormat`,
              metadataSize: sql`excluded.metadataSize`,
              metadataFp: sql`excluded.metadataFp`,
              sha256Hash: sql`excluded.sha256Hash`,
              downloadUrl: sql`excluded.downloadUrl`,
              primary: sql`excluded."primary"`,
              runpodPath: sql`excluded.runpodPath`,
            },
          })
          .returning();

        if (!savedCivitaiFile) {
          console.error(
            `Failed to save or update primary file with Civitai ID ${civitaiFileId}.`
          );
          // This is a significant failure, but doesn't stop image saving below.
        }
      } else {
        console.warn(
          `No primary file found for version Civitai ID ${civitaiVersionId}. Download will not be initiated.`
        );
      }

      // --- 4. Save/Update images for the latest version (BATCH Insert/Upsert) ---
      if (savedCivitaiModelVersion && images && images.length > 0) {
        // Create an array of Drizzle statement builders for each image
        const imageUpsertStatements = images
          .map((image, index) => {
            // Make sure the hash is available before trying to use it as a target
            if (!image.hash) {
              console.warn(
                `Image with URL ${image.url} is missing hash. Skipping upsert for this image.`
              );
              return null; // Return null for images without a hash
            }

            // Return the statement builder *without* calling .returning()
            return db
              .insert(civitaiImages)
              .values({
                civitaiVersionId: savedCivitaiModelVersion.id, // Link to internal version ID
                url: image.url,
                index, // Store the original index
                nsfwLevel: image.nsfwLevel,
                width: image.width,
                height: image.height,
                hash: image.hash, // This is the conflict target
                type: image.type,
                hasMeta: image.hasMeta,
                hasPositivePrompt: image.hasPositivePrompt,
                onSite: image.onSite,
                remixOfId: image.remixOfId,
                // createdAt handled by $defaultFn
                // updatedAt handled by $onUpdateFn
              })
              .onConflictDoUpdate({
                target: civitaiImages.hash, // Target the unique hash column
                set: {
                  // Use sql`excluded.columnName` for batch updates within ON CONFLICT
                  civitaiVersionId: sql`excluded.civitaiVersionId`, // Should link to the current version
                  url: sql`excluded.url`,
                  index: sql`excluded."index"`, // Update index
                  nsfwLevel: sql`excluded.nsfwLevel`,
                  width: sql`excluded.width`,
                  height: sql`excluded.height`,
                  // DO NOT update the hash column when hash is the target!
                  // hash: sql`excluded.hash`,
                  type: sql`excluded.type`,
                  hasMeta: sql`excluded.hasMeta`,
                  hasPositivePrompt: sql`excluded.hasPositivePrompt`,
                  onSite: sql`excluded.onSite`,
                  remixOfId: sql`excluded.remixOfId`,
                  // Add updatedAt explicitly if $onUpdateFn doesn't fire on ON CONFLICT DO UPDATE in D1
                  updatedAt: new Date(),
                },
              })
              .returning();
          })
          .filter((s) => s !== null) as unknown as [
          BatchItem<"sqlite">,
          ...BatchItem<"sqlite">[]
        ];

        if (imageUpsertStatements.length > 0) {
          try {
            // Execute all image upsert statements in a single batch transaction
            // Pass the statement builders directly
            await db.batch(imageUpsertStatements);

            console.log(
              `Successfully saved/updated ${imageUpsertStatements.length} images for version Civitai ID ${civitaiVersionId} using db.batch()`
            );
          } catch (imageBatchError) {
            console.error(
              `Error saving images batch for version Civitai ID ${civitaiVersionId}:`,
              imageBatchError
            );
            // If the batch fails, the transaction is rolled back.
            // Indicate a partial success/error for the overall request.
            finalMessage += " However, failed to save/update images.";
            finalStatus = "ERROR";
            // You might decide to re-throw the error here if image saving is critical
            // throw imageBatchError;
          }
        } else {
          console.log(
            `No valid images with hashes found to save for version Civitai ID ${civitaiVersionId}.`
          );
        }
      } else {
        console.log(
          `No images found in payload for version Civitai ID ${civitaiVersionId} or version not saved.`
        );
      }

      // --- 5. Initiate background download for the primary file (if saved and exists) ---
      // This happens *after* all DB writes are attempted
      if (
        savedCivitaiFile &&
        savedCivitaiFile.primary &&
        savedCivitaiFile.downloadUrl &&
        savedCivitaiFile.runpodPath
      ) {
        try {
          const runpodJob = await endpoint!.run({
            input: {
              save_path: savedCivitaiFile.runpodPath, // Use saved file data
              download_url: savedCivitaiFile.downloadUrl, // Use saved file data
              model_id: savedCivitaiModel.id, // Use saved model data (internal DB ID)
              // Pass Civitai file ID or internal DB file ID if needed by webhook
              civitai_file_id: savedCivitaiFile.civitaiFileId, // Use Civitai File ID
              db_file_id: savedCivitaiFile.id, // Also pass internal DB ID, webhook should use this to update status
            },
            webhook: webhookUrl,
          });

          if (runpodJob?.id) {
            // Check for job ID presence
            runpodJobId = runpodJob.id;
            console.log(
              `Download initiated for ${savedCivitaiFile.name} to ${savedCivitaiFile.runpodPath} with RunPod job ID: ${runpodJobId}, Webhook url ${webhookUrl}`
            );
            // Update the saved file record with the RunPod job ID and set initial status
            await db
              .update(civitaiFiles)
              .set({
                runpodJobId: runpodJobId,
                downloadStatus: "PENDING",
                downloadOutput: "Job initiated with RunPod.",
              }) // Set initial status
              .where(eq(civitaiFiles.id, savedCivitaiFile.id)); // Use the internal DB ID

            finalMessage = `Model ${civitaiId} data saved. Download initiated for primary file ${savedCivitaiFile.name}. RunPod Job ID: ${runpodJobId}`;
            finalStatus = "IN_PROGRESS"; // Backend's status *about the initiation process*
          } else {
            console.error(
              `RunPod endpoint!.run did not return a job ID for file ${savedCivitaiFile.civitaiFileId}. Full job response:`,
              runpodJob
            );
            finalMessage = `Model ${civitaiId} data saved. Failed to get RunPod job ID for primary file ${savedCivitaiFile.name}.`;
            finalStatus = "ERROR"; // Indicate failure in download initiation
            // Update file status to ERROR in DB? Webhook won't fire.
            if (savedCivitaiFile) {
              await db
                .update(civitaiFiles)
                .set({
                  downloadStatus: "ERROR",
                  downloadOutput: `RunPod initiation failed: No job ID returned.`,
                })
                .where(eq(civitaiFiles.id, savedCivitaiFile.id));
            }
          }
        } catch (runpodError: any) {
          console.error("Error initiating RunPod job:", runpodError);
          finalMessage = `Model ${civitaiId} data saved. Error initiating RunPod job for primary file ${savedCivitaiFile.name}.`;
          finalStatus = "ERROR"; // Indicate failure in download initiation
          // Update file status to ERROR in DB? Webhook won't fire.
          if (savedCivitaiFile) {
            await db
              .update(civitaiFiles)
              .set({
                downloadStatus: "ERROR",
                downloadOutput: `RunPod initiation failed: ${
                  runpodError.message || "Unknown API error"
                }`,
              })
              .where(eq(civitaiFiles.id, savedCivitaiFile.id));
          }
        }
      } else if (primaryFile) {
        finalMessage += ` No RunPod job initiated for primary file ${primaryFile.name} (check logs for save failure).`;
        finalStatus = "ERROR"; // Indicates initiation couldn't happen
      } else {
        finalMessage += ` No primary file found in the payload to initiate download.`;
      }

      // --- 6. Final Response ---
      return c.json(
        {
          message: finalMessage,
          status: finalStatus,
          runpodJobId: runpodJobId, // Will be undefined if initiation failed
          civitaiId: civitaiId,
          dbModelId: savedCivitaiModel.id, // Optionally return the internal DB ID
        },
        finalStatus === "ERROR" ? 500 : 200 // Return 500 if the final status is ERROR
      );
    } catch (mainError) {
      // This catch block handles errors during the initial model/version saves
      console.error(
        "Critical error during model data processing or initial DB saves:",
        mainError
      );
      return c.json(
        {
          error: "Failed to process model data or save to database.",
          status: "ERROR",
        },
        500
      );
    }
  })
  .get("/", async (c) => {
    try {
      const db = c.get("db");
      const models = await db.query.civitaiModels.findMany({
        where: (model, { eq, not }) => not(eq(model.status, "DELETED")),
        orderBy: (model, { asc }) => asc(model.createdAt),
        with: {
          versions: {
            orderBy: (version, { asc }) => asc(version.index),
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

      return c.json({ models }, 200);
    } catch (error) {
      console.error("Error fetching Poses with files and images:", error);
      return c.json(
        { error: "Failed to fetch Poses with files and images" },
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
