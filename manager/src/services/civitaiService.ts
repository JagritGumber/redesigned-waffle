import { DrizzleD1Database } from "drizzle-orm/d1";
import { sql, eq } from "drizzle-orm";
import {
  civitaiModels,
  civitaiModelVersions,
  civitaiFiles,
  civitaiImages,
  InsertCivitaiModel,
  InsertCivitaiModelVersion,
  InsertCivitaiFile,
  InsertCivitaiImage,
  civitaiCreator,
} from "@/schema";
import * as schema from "@/schema";

import { Model, ModelVersion, FileVersion } from "@/client/types/civitai";
import db from "@/db";

interface CivitaiServiceEnv {
  RUNPOD_API_KEY: string;
  RUNPOD_DOWNLOADER_ID: string;
  RUNPOD_WEBHOOK_URL: string;
}

const CIVITAI_API_BASE_URL = "https://civitai.com/api/v1";

/**
 * Fetches model details from Civitai API.
 * @param modelId The Civitai model ID.
 * @param token Civitai API token for authentication/higher limits.
 * @returns The model data or null if fetching fails.
 */
export async function fetchCivitaiModel(modelId: number, token: string): Promise<Model | null> {
  const url = `${CIVITAI_API_BASE_URL}/models/${modelId}?token=${token}`;
  try {
    console.log(`Fetching model ${modelId} from Civitai API.`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `Civitai API request failed for model ${modelId}: ${response.status} ${response.statusText}`
      );
      const errorBody = await response.text();
      console.error(`Civitai API error body: ${errorBody}`);
      return null;
    }

    const data = (await response.json()) as Model;
    console.log(`Successfully fetched model ${modelId} details.`);
    return data;
  } catch (error) {
    console.error(`Error fetching model ${modelId} from Civitai API:`, error);
    return null;
  }
}

interface RegisterOrUpdateCivitaiModelOptions {
  triggerDownload?: boolean;
  versionId?: number;
  fileId?: number;
}

/**
 * Registers or updates a Civitai model, a specific version (or latest), its files, and images in the database.
 * Optionally triggers a RunPod download job for a specified file (or the primary file of the selected version).
 *
 * @param env Environment configuration needed for RunPod integration.
 * @param civitaiModelData The model data fetched from the Civitai API.
 * @param options Configuration options for the operation (triggerDownload, versionId, fileId).
 * @returns A result object indicating status, message, and potentially RunPod job ID.
 */
export async function registerOrUpdateCivitaiModel(
  env: CivitaiServiceEnv,
  civitaiModelData: Model,
  options?: RegisterOrUpdateCivitaiModelOptions
): Promise<{
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  message: string;
  id: number;
  dbModelId?: number;
  runpodJobId?: string;
  errors?: string[];
  downloadInitiatedPath?: string;
  loraRunpodPath?: string;
  embeddingRunpodPath?: string;
}> {
  const triggerDownload = options?.triggerDownload ?? true;
  const requestedVersionId = options?.versionId;
  const requestedFileId = options?.fileId;
  const versionRequired = !triggerDownload;

  const { id, name, description, type, nsfw, creator, tags, modelVersions } = civitaiModelData;

  let savedCivitaiModelId: number | undefined = undefined;
  let finalStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" = "FAILED";
  let finalMessage: string = "";
  const errors: string[] = [];
  let runpodJobId: string | undefined = undefined;
  let downloadInitiatedPath: string | undefined = undefined;
  let loraRunpodPath: string | undefined = undefined;
  let embeddingRunpodPath: string | undefined = undefined;

  try {
    const [savedCreator] = await db
      .insert(civitaiCreator)
      .values({
        username: creator.username,
        image: creator.image,
      } satisfies schema.InsertCivitaiCreator)
      .onConflictDoUpdate({
        target: civitaiCreator.username,
        set: {
          image: creator.image,
        },
      })
      .returning();

    const [savedCivitaiModel] = await db
      .insert(civitaiModels)
      .values({
        id,
        name,
        description,
        nsfw,
        creatorId: savedCreator.id,
        tags: tags,
        type: type,
      } satisfies InsertCivitaiModel)
      .onConflictDoUpdate({
        target: civitaiModels.id,
        set: {
          name,
          description,
          type,
          nsfw,
          creatorId: savedCreator.id,
          tags: tags,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!savedCivitaiModel) {
      throw new Error(`Failed to save or update model with Civitai ID ${id}.`);
    }
    savedCivitaiModelId = savedCivitaiModel.id;
    finalStatus = "SUCCESS";
    finalMessage = `Model ${id} metadata saved.`;
  } catch (error: any) {
    console.error(`Error saving/updating model ${id}:`, error);
    errors.push(`Failed to save base model metadata: ${error.message}`);

    return {
      status: "FAILED",
      message: `Failed to save model ${id} metadata.`,
      id: id,
      errors: errors,
    };
  }

  let selectedVersion: ModelVersion | undefined;

  if (requestedVersionId !== undefined) {
    selectedVersion = modelVersions?.find((v) => v.id === requestedVersionId);
    if (!selectedVersion) {
      const msg = `Requested version ID ${requestedVersionId} not found for model Civitai ID ${id}.`;
      console.warn(msg);
      errors.push(msg);

      finalStatus = "PARTIAL_SUCCESS";
      finalMessage += ` ${msg}`;
      return {
        status: finalStatus,
        message: finalMessage,
        id: id,
        dbModelId: savedCivitaiModelId,
        errors: errors.length > 0 ? errors : undefined,
      };
    }
    console.log(`Selected requested version ${selectedVersion.id}.`);
  } else {
    selectedVersion = modelVersions?.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )?.[0];
    if (!selectedVersion) {
      const msg = `No versions found for model Civitai ID ${id} in the payload.`;
      console.warn(msg);
      errors.push(msg);
      finalStatus = "PARTIAL_SUCCESS";
      finalMessage += ` ${msg}`;
      return {
        status: finalStatus,
        message: finalMessage,
        id: id,
        dbModelId: savedCivitaiModelId,
        errors: errors.length > 0 ? errors : undefined,
      };
    }
    console.log(`Selected latest version ${selectedVersion.id}.`);
  }

  let savedCivitaiModelVersionId: number | undefined = undefined;

  try {
    await db.transaction(async (tx) => {
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
      } = selectedVersion;

      const [savedCivitaiModelVersion] = await tx
        .insert(civitaiModelVersions)
        .values({
          civitaiModelId: savedCivitaiModelId!,
          id: civitaiVersionId,
          index,
          name: versionName,
          baseModel,
          baseModelType,
          publishedAt: publishedAt,
          availability: versionAvailability,
          nsfwLevel: versionNsfwLevel,
          description: versionDescription ?? "",
          trainedWords: trainedWords ?? null,
          supportsGeneration: versionSupportsGeneration,
          downloadUrl: versionDownloadUrl,
          updatedAt: new Date(),
          required: versionRequired,
        } satisfies InsertCivitaiModelVersion)
        .onConflictDoUpdate({
          target: civitaiModelVersions.id,
          set: {
            civitaiModelId: sql`excluded.civitaiModelId`,
            index: sql`excluded."index"`,
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
        throw new Error(`Failed to save or update version with Civitai ID ${civitaiVersionId}.`);
      }
      savedCivitaiModelVersionId = savedCivitaiModelVersion.id;
      finalMessage += ` Version ${civitaiVersionId} metadata saved.`;

      const targetVolumeBase = triggerDownload ? "/runpod-volume" : "/defaults";

      const modelTypeDir =
        type === "LORA" ? "loras" : type === "TextualInversion" ? "embeddings" : "models";

      const sanitizedModelName = name?.replace(/[^a-zA-Z0-9._-]/g, "_") || `model_${id}`;
      const sanitizedVersionName =
        versionName?.replace(/[^a-zA-Z0-9._-]/g, "_") || `version_${civitaiVersionId}`;

      const versionBasePath = `${targetVolumeBase}/workspace/${modelTypeDir}/${sanitizedModelName}:${sanitizedVersionName}`;

      if (files && files.length > 0) {
        try {
          for (const fileData of files) {
            const sanitizedFileName =
              fileData.name?.replace(/[^a-zA-Z0-9._-]/g, "_") || `file_${fileData.id}`;
            const runpodPath = `${versionBasePath}:${sanitizedFileName}`;

            await tx
              .insert(civitaiFiles)
              .values({
                civitaiVersionId: savedCivitaiModelVersion.id,
                id: fileData.id,
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
                scannedAt: new Date(fileData.scannedAt),
                downloadUrl: fileData.downloadUrl,
                runpodPath: runpodPath,
              } satisfies InsertCivitaiFile)
              .onConflictDoUpdate({
                target: civitaiFiles.id,
                set: {
                  civitaiVersionId: sql`excluded.civitaiVersionId`,
                  name: sql`excluded.name`,
                  type: sql`excluded.type`,
                  sizeKB: sql`excluded.sizeKB`,
                  pickleScanResult: sql`excluded.pickleScanResult`,
                  pickleScanMessage: sql`excluded.pickleScanMessage`,
                  virusScanResult: sql`excluded.virusScanResult`,
                  virusScanMessage: sql`excluded.virusScanMessage`,
                  scannedAt: sql`excluded.scannedAt`,
                  downloadUrl: sql`excluded.downloadUrl`,
                  runpodPath: sql`excluded.runpodPath`,

                  downloadStatus: sql<
                    "PENDING" | "PENDING_REGISTRATION" | "ERROR" | "DOWNLOAD_FAILED"
                  >`CASE WHEN ${civitaiFiles.downloadStatus} IN ('PENDING', 'PENDING_REGISTRATION', 'ERROR', 'DOWNLOAD_FAILED') THEN 'PENDING_REGISTRATION' ELSE ${civitaiFiles.downloadStatus} END`.mapWith(
                    civitaiFiles.downloadStatus
                  ),
                  downloadOutput: sql`CASE WHEN ${civitaiFiles.downloadStatus} IN ('PENDING', 'PENDING_REGISTRATION', 'ERROR', 'DOWNLOAD_FAILED') THEN 'FileVersion metadata saved/updated.' ELSE ${civitaiFiles.downloadOutput} END`,
                },
              })
              .returning();
          }
          finalMessage += ` ${files.length} files metadata saved/updated for version ${selectedVersion.id}.`;
        } catch (fileError: any) {
          console.error(`Error saving files for version ${selectedVersion.id}:`, fileError);
          errors.push(`Failed to save/update files metadata: ${fileError.message}`);
          finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` Error saving files.`;
          tx.rollback();
          throw fileError;
        }
      } else {
        const msg = `No files found in payload for version ${selectedVersion.id} or none had hashes to upsert.`;
        console.warn(msg);
        errors.push(msg);
        finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
      }

      if (
        savedCivitaiModelVersionId &&
        selectedVersion.images &&
        selectedVersion.images.length > 0
      ) {
        try {
          let imageIndex = 0; // Initialize index
          for (const imageData of selectedVersion.images) {
            if (!imageData.hash) {
              console.warn(
                `Image with URL ${imageData.url} is missing hash. Skipping upsert for this image.`
              );
              continue;
            }

            await tx
              .insert(civitaiImages)
              .values({
                civitaiVersionId: savedCivitaiModelVersionId!,
                index: imageIndex, // Use the new index variable
                width: imageData.width,
                height: imageData.height,
                hash: imageData.hash,
                hasMeta: imageData.hasMeta,
                url: imageData.url,
                nsfwLevel: imageData.nsfwLevel,
              } satisfies InsertCivitaiImage)
              .onConflictDoUpdate({
                target: civitaiImages.hash,
                set: {
                  civitaiVersionId: sql`excluded.civitaiVersionId`,
                  url: sql`excluded.url`,
                  index: sql`excluded."index"`,
                  nsfwLevel: sql`excluded.nsfwLevel`,
                  width: sql`excluded.width`,
                  height: sql`excluded.height`,
                  hasMeta: imageData.hasMeta,
                },
              })
              .returning();
            imageIndex++; // Increment index
          }
          finalMessage += ` ${selectedVersion.images.length} images metadata saved/updated for version ${selectedVersion.id}.`;
        } catch (imageError: any) {
          console.error(`Error saving images for version ${selectedVersion.id}:`, imageError);
          errors.push(`Failed to save/update images metadata: ${imageError.message}`);
          finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` Error saving images.`;
          tx.rollback();
          throw imageError;
        }
      } else if (savedCivitaiModelVersionId) {
        console.log(`No images found in payload for version ${selectedVersion.id}.`);
      } else {
      }
    });
  } catch (versionFileDataError: any) {
    console.error(
      `Error processing version/file/image data for model ${id}:`,
      versionFileDataError
    );
    errors.push(`Failed to process version/file/image data: ${versionFileDataError.message}`);

    finalStatus = finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : "FAILED";
    finalMessage = `Failed to process version/file/image data for model ${id}.`;
  }

  return {
    status: finalStatus,
    message: finalMessage,
    id: id,
    dbModelId: savedCivitaiModelId,
    runpodJobId: runpodJobId,
    errors: errors.length > 0 ? errors : undefined,
    downloadInitiatedPath: downloadInitiatedPath,
    loraRunpodPath: loraRunpodPath,
    embeddingRunpodPath: embeddingRunpodPath,
  };
}
