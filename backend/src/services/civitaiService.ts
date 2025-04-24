// src/services/civitaiService.ts (or similar)

import { DrizzleD1Database } from "drizzle-orm/d1"; // Adjust based on your DB type
import { sql, eq } from "drizzle-orm"; // Adjust based on your DB type
import {
  civitaiModels,
  civitaiModelVersions,
  civitaiFiles,
  civitaiImages,
  InsertCivitaiModel, // Assuming you have these types exported from your schema file
  InsertCivitaiModelVersion,
  InsertCivitaiFile,
  InsertCivitaiImage,
} from "@/schema"; // Adjust path to your schema file
import * as schema from "@/schema";

// Needed imports for RunPod SDK and webhook URL construction
import runpodSdk from "runpod-sdk"; // Assuming you installed this
import { BatchItem } from "drizzle-orm/batch"; // For the batch upsert type
import { Model } from "@/client/types/civitai";

// Define the minimum environment variables needed by this service
interface CivitaiServiceEnv {
  RUNPOD_API_KEY: string;
  RUNPOD_DOWNLOADER_ID: string;
  RUNPOD_WEBHOOK_URL: string; // Base webhook URL provided by RunPod
  // Add any other necessary env vars here
}

const CIVITAI_API_BASE_URL = "https://civitai.com/api/v1";

/**
 * Fetches model details from Civitai API.
 * @param modelId The Civitai model ID.
 * @returns The model data or null if fetching fails.
 */
export async function fetchCivitaiModel(
  modelId: number,
  token: string
): Promise<Model | null> {
  // Use 'any' or your 'Model' type
  const url = `${CIVITAI_API_BASE_URL}/models/${modelId}?token=${token}`;
  try {
    console.log(`Fetching model ${modelId} from Civitai API: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `Civitai API request failed for model ${modelId}: ${response.status} ${response.statusText}`
      );
      // Consider logging response body for more details
      const errorBody = await response.text();
      console.error(`Civitai API error body: ${errorBody}`);
      return null;
    }

    const data = (await response.json()) as Model;
    console.log(`Successfully fetched model ${modelId} details.`);
    return data; // Return the full fetched data structure
  } catch (error) {
    console.error(`Error fetching model ${modelId} from Civitai API:`, error);
    return null;
  }
}

/**
 * Registers or updates a Civitai model, its latest version, files, and images in the database.
 * Optionally triggers a RunPod download job for the primary file.
 *
 * @param db The Drizzle D1 database instance.
 * @param env Environment configuration needed for RunPod integration.
 * @param civitaiModelData The model data fetched from the Civitai API (or equivalent structure).
 * @param options Configuration options for the operation.
 * @returns A result object indicating status, message, and potentially RunPod job ID.
 */
export async function registerOrUpdateCivitaiModel(
  db: DrizzleD1Database<typeof schema>, // Use the correct Drizzle DB type
  env: CivitaiServiceEnv, // Use the interface for env vars
  civitaiModelData: Model, // Use 'any' or your 'Model' type
  options?: {
    triggerDownload?: boolean; // Defaults to true
  }
): Promise<{
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  message: string;
  civitaiId: number;
  dbModelId?: string; // Internal DB ID of the model
  runpodJobId?: string;
  errors?: string[]; // Collect errors
  loraRunpodPath?: string; // Return the calculated path
  embeddingRunpodPath?: string; // Return the calculated path
}> {
  const triggerDownload = options?.triggerDownload ?? true; // Default to true

  const {
    id: civitaiId,
    name,
    description,
    allowNoCredit,
    allowCommercialUse,
    allowDerivatives,
    allowDifferentLicense,
    type, // Use Civitai 'type' to determine file paths
    nsfw,
    nsfwLevel,
    availability,
    supportsGeneration,
    creator,
    tags,
    modelVersions,
  } = civitaiModelData;

  let savedCivitaiModelId: string | undefined = undefined; // Store the internal DB ID
  let finalStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" = "FAILED";
  let finalMessage: string = "";
  const errors: string[] = [];
  let runpodJobId: string | undefined = undefined;
  let calculatedRunpodPath: string | undefined = undefined; // Path for the primary file
  let loraRunpodPath: string | undefined = undefined;
  let embeddingRunpodPath: string | undefined;

  // --- 1. Save/Update to civitaiModels table ---
  try {
    const [savedCivitaiModel] = await db
      .insert(civitaiModels)
      .values({
        civitaiId,
        name,
        description,
        allowNoCredit,
        allowCommercialUse: JSON.stringify(allowCommercialUse), // Store as JSON
        allowDerivatives,
        allowDifferentLicense,
        type,
        nsfw,
        nsfwLevel,
        availability,
        supportsGeneration: supportsGeneration,
        creatorUsername: creator?.username || null, // Handle missing creator
        tags: JSON.stringify(tags), // Store as JSON
        status: "METADATA_SAVED", // Initial status after saving metadata
        createdAt: new Date(), // Or use API's createdAt if available and valid
        updatedAt: new Date(),
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
          creatorUsername: creator?.username || null,
          tags: JSON.stringify(tags),
          // DO NOT update status here unless you have specific logic
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!savedCivitaiModel) {
      throw new Error(
        `Failed to save or update model with Civitai ID ${civitaiId}.`
      );
    }
    savedCivitaiModelId = savedCivitaiModel.id;
    finalStatus = "SUCCESS"; // Assume success unless version/file saving fails
    finalMessage = `Model ${civitaiId} metadata saved.`;
  } catch (error: any) {
    console.error(`Error saving/updating model ${civitaiId}:`, error);
    errors.push(`Failed to save base model metadata: ${error.message}`);
    finalStatus = "FAILED";
    finalMessage = `Failed to save model ${civitaiId} metadata.`;
    // If base model save fails, we cannot proceed.
    return {
      status: finalStatus,
      message: finalMessage,
      civitaiId: civitaiId,
      dbModelId: savedCivitaiModelId!,
      errors: errors,
    };
  }

  // Find the latest version based on publishedAt
  const latestVersion = modelVersions?.sort(
    (a: any, b: any) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )?.[0]; // Use optional chaining in case modelVersions is null/undefined

  if (!latestVersion) {
    const msg = `No versions found for model Civitai ID ${civitaiId} in the payload.`;
    console.warn(msg);
    errors.push(msg);
    // Model metadata was saved, so this is a partial success
    finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
    finalMessage += ` ${msg}`; // Append warning to message

    // Still return the result even if no version was processed
    return {
      status: finalStatus,
      message: finalMessage,
      civitaiId: civitaiId,
      dbModelId: savedCivitaiModelId,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // --- 2. Save/Update the latest version ---
  let savedCivitaiModelVersionId: string | undefined = undefined;

  try {
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
      downloadUrl: versionDownloadUrl, // This is the version's primary download URL, not a specific file
      files,
      images,
    } = latestVersion;

    const [savedCivitaiModelVersion] = await db
      .insert(civitaiModelVersions)
      .values({
        civitaiModelId: savedCivitaiModelId!, // Link to internal model ID
        civitaiVersionId,
        index,
        name: versionName,
        baseModel,
        baseModelType,
        publishedAt: publishedAt, // Parse date string
        availability: versionAvailability,
        nsfwLevel: versionNsfwLevel,
        description: versionDescription,
        trainedWords: trainedWords ? JSON.stringify(trainedWords) : null, // Store as JSON
        supportsGeneration: versionSupportsGeneration,
        downloadUrl: versionDownloadUrl,
        // createdAt handled by $defaultFn
        updatedAt: new Date(), // Or $onUpdateFn
      } satisfies InsertCivitaiModelVersion)
      .onConflictDoUpdate({
        target: civitaiModelVersions.civitaiVersionId,
        set: {
          // Link must point to the *current* model's DB ID, which might be new if it was upserted
          civitaiModelId: sql`excluded.civitaiModelId`, // Use excluded to get the correct linked model ID
          index: sql`excluded."index"`, // Update index
          name: sql`excluded.name`,
          baseModel: sql`excluded.baseModel`,
          baseModelType: sql`excluded.baseModelType`,
          publishedAt: sql`excluded.publishedAt`,
          availability: sql`excluded.availability`,
          nsfwLevel: sql`excluded.nsfwLevel`,
          description: sql`excluded.description`,
          trainedWords: sql`excluded.trainedWords`,
          supportsGeneration: sql`excluded.supportsGeneration`,
          downloadUrl: sql`excluded.downloadUrl`,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!savedCivitaiModelVersion) {
      throw new Error(
        `Failed to save or update version with Civitai ID ${civitaiVersionId}.`
      );
    }
    savedCivitaiModelVersionId = savedCivitaiModelVersion.id;
    finalMessage += ` Version ${civitaiVersionId} metadata saved.`;

    // Determine base path for files based on model type
    const modelTypeDir =
      civitaiModelData.type === "LORA"
        ? "loras"
        : civitaiModelData.type === "TextualInversion"
        ? "embeddings"
        : "models"; // Default dir for other types

    const sanitizedModelName =
      name?.replace(/[^a-zA-Z0-9._-]/g, "_") || `model_${civitaiId}`;
    const sanitizedVersionName =
      versionName?.replace(/[^a-zA-Z0-9._-]/g, "_") ||
      `version_${civitaiVersionId}`;

    // Base path for files of this version
    const versionBasePath = triggerDownload
      ? `/runpod-volume/workspace/${modelTypeDir}/${sanitizedModelName}/${sanitizedVersionName}`
      : `/defaults/workspace/${modelTypeDir}/${sanitizedModelName}/${sanitizedVersionName}`;

    // --- 3. Save/Update files for the latest version ---
    // Batch upsert files related to this version
    const filesToUpsert = files
      ?.map((fileData: any) => {
        // Use 'any' or your file type
        // Calculate the RunPod path for *each* file, including the file name
        const sanitizedFileName =
          fileData.name?.replace(/[^a-zA-Z0-9._-]/g, "_") ||
          `file_${fileData.id}`;
        const runpodPath = `${versionBasePath}/${sanitizedFileName}`;

        // Store the primary file's path separately if this is the primary file
        if (fileData.primary) {
          calculatedRunpodPath = runpodPath;
          if (civitaiModelData.type === "LORA") {
            // If it's a LORA, the calculated path is a LORA path
            loraRunpodPath = calculatedRunpodPath; // Use 'this' or return it in the result
          } else if (civitaiModelData.type === "TextualInversion") {
            // If it's a TI, the calculated path is an embedding path
            embeddingRunpodPath = calculatedRunpodPath; // Use 'this' or return it in the result
          }
        }

        return db
          .insert(civitaiFiles)
          .values({
            civitaiVersionId: savedCivitaiModelVersion.id, // Link to internal version ID
            civitaiFileId: fileData.id,
            name: fileData.name,
            type: fileData.type,
            sizeKB: fileData.sizeKB,
            pickleScanResult: fileData.pickleScanResult
              ? JSON.stringify(fileData.pickleScanResult)
              : null,
            pickleScanMessage: fileData.pickleScanMessage,
            virusScanResult: fileData.virusScanResult
              ? JSON.stringify(fileData.virusScanResult)
              : null,
            virusScanMessage: fileData.virusScanMessage,
            scannedAt: fileData.scannedAt,
            metadataFormat: fileData.metadata?.format,
            metadataSize: fileData.metadata?.size,
            metadataFp: fileData.metadata?.fp,
            sha256Hash: fileData.hashes?.SHA256,
            downloadUrl: fileData.downloadUrl,
            primary: fileData.primary ?? false, // Ensure boolean
            runpodPath: runpodPath, // Store the calculated path
            // Set initial download status
            downloadStatus: "PENDING_REGISTRATION", // e.g., waiting for downloader to pick up
            downloadOutput: "File metadata saved.",
            // createdAt handled by $defaultFn
            updatedAt: new Date(), // Or $onUpdateFn
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
              // Only update status/output if they indicate pending or error, not if already completed
              downloadStatus: sql`CASE WHEN ${civitaiFiles.downloadStatus} IN ('PENDING', 'PENDING_REGISTRATION', 'ERROR', 'DOWNLOAD_FAILED') THEN 'PENDING_REGISTRATION' ELSE ${civitaiFiles.downloadStatus} END`,
              downloadOutput: sql`CASE WHEN ${civitaiFiles.downloadStatus} IN ('PENDING', 'PENDING_REGISTRATION', 'ERROR', 'DOWNLOAD_FAILED') THEN 'File metadata updated.' ELSE ${civitaiFiles.downloadOutput} END`,
              updatedAt: new Date(),
            },
          })
          .returning(); // Returning is needed for batch type inference, but batch ignores results
      })
      ?.filter((s) => s !== null) as unknown as [
      BatchItem<"sqlite">,
      ...BatchItem<"sqlite">[]
    ]; // Filter out nulls and cast for db.batch

    if (filesToUpsert && filesToUpsert.length > 0) {
      try {
        await db.batch(filesToUpsert);
        finalMessage += ` ${filesToUpsert.length} files metadata saved/updated.`;
        // Status might remain SUCCESS or become PARTIAL_SUCCESS if images fail
      } catch (fileBatchError: any) {
        console.error(
          `Error saving files batch for version ${civitaiVersionId}:`,
          fileBatchError
        );
        errors.push(
          `Failed to save/update files metadata: ${fileBatchError.message}`
        );
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` Error saving files.`;
        // Do NOT re-throw, continue to images if possible
      }
    } else {
      const msg = `No files found in payload for version ${civitaiVersionId} or none had hashes to upsert.`;
      console.warn(msg);
      errors.push(msg);
      finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
      finalMessage += ` ${msg}`;
    }

    // --- 4. Save/Update images for the latest version (BATCH Insert/Upsert) ---
    // Only attempt if version was saved
    if (savedCivitaiModelVersionId && images && images.length > 0) {
      const imageUpsertStatements = images
        .map((imageData, index: number) => {
          // Use 'any' or your image type
          // Make sure the hash is available before trying to use it as a target
          if (!imageData.hash) {
            console.warn(
              `Image with URL ${imageData.url} is missing hash. Skipping upsert for this image.`
            );
            return null; // Return null for images without a hash or other required fields
          }

          // Return the statement builder *without* calling .returning()
          return db
            .insert(civitaiImages)
            .values({
              civitaiVersionId: savedCivitaiModelVersionId!, // Link to internal version ID
              index, // Store the original index
              nsfwLevel: imageData.nsfwLevel,
              width: imageData.width,
              height: imageData.height,
              hash: imageData.hash, // This is the conflict target
              type: imageData.type,
              hasMeta: imageData.hasMeta,
              hasPositivePrompt: imageData.hasPositivePrompt,
              onSite: imageData.onSite,
              remixOfId: imageData.remixOfId,
              prompt: imageData.meta?.prompt || null,
              negativePrompt: imageData.meta?.negativePrompt || null,
              seed: imageData.meta?.seed || null,
              steps: imageData.meta?.steps || null,
              cfgScale: imageData.meta?.cfgScale || null,
              sampler: imageData.meta?.sampler || null,
              clipSkip: imageData.meta?.clipSkip || null,
              url: imageData.url,
            } satisfies InsertCivitaiImage)
            .onConflictDoUpdate({
              target: civitaiImages.hash, // Target the unique hash column
              set: {
                civitaiVersionId: sql`excluded.civitaiVersionId`, // Should link to the current version
                url: sql`excluded.url`,
                index: sql`excluded."index"`, // Update index
                nsfwLevel: sql`excluded.nsfwLevel`,
                width: sql`excluded.width`,
                height: sql`excluded.height`,
                type: sql`excluded.type`,
                hasMeta: sql`excluded.hasMeta`,
                hasPositivePrompt: sql`excluded.hasPositivePrompt`,
                onSite: sql`excluded.onSite`,
                remixOfId: sql`excluded.remixOfId`,
                prompt: sql`excluded.prompt`,
                negativePrompt: sql`excluded.negativePrompt`,
                seed: sql`excluded.seed`,
                steps: sql`excluded.steps`,
                cfgScale: sql`excluded.cfgScale`,
                sampler: sql`excluded.sampler`,
                clipSkip: sql`excluded.clipSkip`,
              },
            })
            .returning(); // Required for batch type inference
        })
        .filter((s) => s !== null) as unknown as [
        BatchItem<"sqlite">,
        ...BatchItem<"sqlite">[]
      ]; // Filter out nulls and cast for db.batch

      if (imageUpsertStatements.length > 0) {
        try {
          // Execute all image upsert statements in a single batch transaction
          await db.batch(imageUpsertStatements);
          finalMessage += ` ${imageUpsertStatements.length} images metadata saved/updated.`;
          // Status remains as determined by file saving
        } catch (imageBatchError: any) {
          console.error(
            `Error saving images batch for version ${civitaiVersionId}:`,
            imageBatchError
          );
          errors.push(
            `Failed to save/update images metadata: ${imageBatchError.message}`
          );
          finalStatus =
            finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` Error saving images.`;
          // Do NOT re-throw
        }
      } else {
        const msg = `No valid images found to save/update for version ${civitaiVersionId}.`;
        console.log(msg); // Use log, not warn, if it's expected
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
      }
    } else {
      console.log(
        `No images found in payload for version ${civitaiVersionId}.`
      );
    }

    // --- 5. Initiate background download for the primary file (if applicable) ---
    // Only initiate if triggerDownload is true AND we found a primary file AND it has a download URL and path
    // We need to find the primary file again as the batch upsert doesn't return it easily
    const primaryFileRecord = files?.find((fileData) => fileData.primary);

    if (
      triggerDownload &&
      primaryFileRecord &&
      primaryFileRecord.downloadUrl &&
      calculatedRunpodPath
    ) {
      const runpodEndpointId = env.RUNPOD_DOWNLOADER_ID;
      const rawWebhookUrl = env.RUNPOD_WEBHOOK_URL; // Get raw URL
      const runpodApiKey = env.RUNPOD_API_KEY;

      // Ensure required env vars are present for download initiation
      if (!runpodApiKey || !runpodEndpointId || !rawWebhookUrl) {
        const msg =
          "Missing RunPod environment variables required to trigger download.";
        console.error(msg);
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
      } else {
        try {
          const runpod = runpodSdk(runpodApiKey); // Initialize SDK
          const endpoint = runpod.endpoint(runpodEndpointId); // Get endpoint

          const webhookUrl = `${rawWebhookUrl}/downloader`; // Construct the full webhook URL

          const runpodJob = await endpoint!.run({
            input: {
              save_path: calculatedRunpodPath,
              download_url: primaryFileRecord.downloadUrl,
              model_id: savedCivitaiModelId!,
              civitai_file_id: primaryFileRecord.id,
              db_file_id: sql`LAST_INSERT_ROWID()`,
              model_type: civitaiModelData.type,
            },
            webhook: webhookUrl,
          });

          if (runpodJob?.id) {
            runpodJobId = runpodJob.id;
            console.log(
              `Download initiated for ${primaryFileRecord.name} to ${calculatedRunpodPath} with RunPod job ID: ${runpodJobId}`
            );
            // Update the saved file record with the RunPod job ID and set status
            // Need the internal DB file ID here. We can fetch it after the batch upsert.
            const fileRecord = await db.query.civitaiFiles.findFirst({
              where: eq(civitaiFiles.civitaiFileId, primaryFileRecord.id),
              columns: { id: true },
            });

            if (fileRecord) {
              await db
                .update(civitaiFiles)
                .set({
                  runpodJobId: runpodJobId,
                  downloadStatus: "PENDING",
                  downloadOutput: "Job initiated with RunPod.",
                }) // Set initial status
                .where(eq(civitaiFiles.id, fileRecord.id)); // Use the internal DB ID
              finalMessage += ` Download initiated for primary file ${primaryFileRecord.name}. RunPod Job ID: ${runpodJobId}.`;
              // Status might remain SUCCESS, become PARTIAL_SUCCESS, or remain FAILED
              // If download initiates successfully, it's at least PARTIAL_SUCCESS if other things failed
              if (
                (finalStatus as any) === "FAILED" &&
                errors.length > 0 &&
                errors[0].startsWith("Failed to save base model")
              ) {
                // If the base model save failed, we shouldn't even reach here.
                // This case implies metadata was saved ok, but download failed.
                finalStatus = "PARTIAL_SUCCESS";
              } else if ((finalStatus as any) !== "FAILED") {
                finalStatus = "SUCCESS"; // If everything else was fine, initiating download makes it success
              }
            } else {
              const msg = `Could not find saved primary file record (Civitai ID ${primaryFileRecord.id}) to update download status after initiation.`;
              console.error(msg);
              errors.push(msg);
              finalStatus =
                finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
              finalMessage += ` ${msg}`;
            }
          } else {
            const msg = `RunPod endpoint.run did not return a job ID for file ${primaryFileRecord.id}.`;
            console.error(msg, runpodJob);
            errors.push(msg);
            finalStatus =
              finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
            finalMessage += ` ${msg}`;
            // Update file status to ERROR in DB? Webhook won't fire.
            const fileRecord = await db.query.civitaiFiles.findFirst({
              where: eq(civitaiFiles.civitaiFileId, primaryFileRecord.id),
              columns: { id: true },
            });
            if (fileRecord) {
              await db
                .update(civitaiFiles)
                .set({
                  downloadStatus: "ERROR",
                  downloadOutput: msg,
                })
                .where(eq(civitaiFiles.id, fileRecord.id));
            }
          }
        } catch (runpodError: any) {
          const msg = `Error initiating RunPod job for file ${
            primaryFileRecord.id
          }: ${runpodError.message || "Unknown API error"}`;
          console.error(msg, runpodError);
          errors.push(msg);
          finalStatus =
            finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` ${msg}`;
          // Update file status to ERROR in DB? Webhook won't fire.
          const fileRecord = await db.query.civitaiFiles.findFirst({
            where: eq(civitaiFiles.civitaiFileId, primaryFileRecord.id),
            columns: { id: true },
          });
          if (fileRecord) {
            await db
              .update(civitaiFiles)
              .set({
                downloadStatus: "ERROR",
                downloadOutput: msg,
              })
              .where(eq(civitaiFiles.id, fileRecord.id));
          }
        }
      }
    } else if (
      triggerDownload &&
      (!primaryFileRecord ||
        !primaryFileRecord.downloadUrl ||
        !calculatedRunpodPath)
    ) {
      // Download was requested, but no primary file found or data missing
      const msg = `Download requested, but no primary file with download URL and path found for model ${civitaiId} version ${latestVersion.id}.`;
      console.warn(msg);
      errors.push(msg);
      finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
      finalMessage += ` ${msg}`;
    } else {
      // Download was not requested or not applicable
      finalMessage += " Download not initiated.";
    }
  } catch (versionOrFileDataError: any) {
    // Catch errors specific to version, file, or image saving
    console.error(
      `Error processing version/file/image data for model ${civitaiId}:`,
      versionOrFileDataError
    );
    errors.push(
      `Failed to process version/file/image data: ${versionOrFileDataError.message}`
    );
    finalStatus = "FAILED"; // If versions/files fail, the whole model registration is likely incomplete
    finalMessage = `Failed to process version/file/image data for model ${civitaiId}.`;
    // No need to return here, the end return will handle status
  }

  // Final Return
  return {
    status: finalStatus,
    message: finalMessage,
    civitaiId: civitaiId,
    dbModelId: savedCivitaiModelId,
    runpodJobId: runpodJobId,
    errors: errors.length > 0 ? errors : undefined,
    // Return calculated paths for potential use
    loraRunpodPath: loraRunpodPath,
    embeddingRunpodPath: embeddingRunpodPath,
  };
}
