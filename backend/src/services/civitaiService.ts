import { DrizzleD1Database } from "drizzle-orm/d1";
import { and, sql, eq } from "drizzle-orm";
import {
  civitaiModels,
  civitaiModelVersions,
  civitaiFiles,
  civitaiImages,
  civitaiModelInstalls,
  InsertCivitaiModel,
  InsertCivitaiModelVersion,
  InsertCivitaiFile,
  InsertCivitaiImage,
  civitaiCreator,
} from "@/schema";
import * as schema from "@/schema";

import runpodSdk from "runpod-sdk";
import { BatchItem } from "drizzle-orm/batch";
import { Model, ModelVersion, FileVersion } from "@/client/types/civitai";
import {
  isModelImageRebuildConfigured,
  triggerModelImageBuild,
} from "./modelImageBuildService";

interface CivitaiServiceEnv {
  RUNPOD_API_KEY?: string;
  RUNPOD_DOWNLOADER_ID?: string;
  RUNPOD_WEBHOOK_URL?: string;
  MODEL_IMAGE_REBUILD_PROVIDER?: string;
  MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY?: string;
  MODEL_IMAGE_REBUILD_GITHUB_TOKEN?: string;
  MODEL_IMAGE_REBUILD_WEBHOOK_URL?: string;
  MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN?: string;
}

const CIVITAI_API_BASE_URL = "https://civitai.com/api/v1";

async function findReusableReadyModelImageInstall(
  db: DrizzleD1Database<typeof schema>,
  civitaiModelId: number,
  civitaiFileId: number,
) {
  const [install] = await db
    .select()
    .from(civitaiModelInstalls)
    .where(
      and(
        eq(civitaiModelInstalls.civitaiModelId, civitaiModelId),
        eq(civitaiModelInstalls.civitaiFileId, civitaiFileId),
        eq(civitaiModelInstalls.status, "READY"),
        sql`${civitaiModelInstalls.imageName} IS NOT NULL`,
      ),
    )
    .limit(1);

  return install;
}

/**
 * Fetches model details from Civitai API.
 * @param modelId The Civitai model ID.
 * @param token Civitai API token for authentication/higher limits.
 * @returns The model data or null if fetching fails.
 */
export async function fetchCivitaiModel(
  modelId: number,
  token: string
): Promise<Model | null> {
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
  userId?: string;
}

/**
 * Registers or updates a Civitai model, a specific version (or latest), its files, and images in the database.
 * Optionally triggers a RunPod download job for a specified file (or the primary file of the selected version).
 *
 * @param db The Drizzle D1 database instance.
 * @param env Environment configuration needed for RunPod integration.
 * @param civitaiModelData The model data fetched from the Civitai API.
 * @param options Configuration options for the operation (triggerDownload, versionId, fileId).
 * @returns A result object indicating status, message, and potentially RunPod job ID.
 */
export async function registerOrUpdateCivitaiModel(
  db: DrizzleD1Database<typeof schema>,
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
  const userId = options?.userId;
  const versionRequired = !triggerDownload;

  const { id, name, description, type, nsfw, creator, tags, modelVersions } =
    civitaiModelData;

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

    if (userId) {
      await db
        .insert(civitaiModelInstalls)
        .values({
          userId,
          civitaiModelId: savedCivitaiModelId,
          defaultWeight: 0.6,
          status: "READY",
        })
        .onConflictDoUpdate({
          target: [civitaiModelInstalls.userId, civitaiModelInstalls.civitaiModelId],
          set: {
            updatedAt: new Date(),
          },
        });
    }

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
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
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

    const [savedCivitaiModelVersion] = await db
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
      throw new Error(
        `Failed to save or update version with Civitai ID ${civitaiVersionId}.`
      );
    }
    savedCivitaiModelVersionId = savedCivitaiModelVersion.id;
    finalMessage += ` Version ${civitaiVersionId} metadata saved.`;

    const targetVolumeBase = triggerDownload ? "/runpod-volume" : "/defaults";

    const modelTypeDir =
      type === "LORA"
        ? "loras"
        : type === "TextualInversion"
        ? "embeddings"
        : "models";

    const sanitizedModelName =
      name?.replace(/[^a-zA-Z0-9._-]/g, "_") || `model_${id}`;
    const sanitizedVersionName =
      versionName?.replace(/[^a-zA-Z0-9._-]/g, "_") ||
      `version_${civitaiVersionId}`;

    const versionBasePath = `${targetVolumeBase}/workspace/${modelTypeDir}/${sanitizedModelName}:${sanitizedVersionName}`;

    const filesToUpsert = files
      ?.map((fileData: FileVersion) => {
        const sanitizedFileName =
          fileData.name?.replace(/[^a-zA-Z0-9._-]/g, "_") ||
          `file_${fileData.id}`;
        const runpodPath = `${versionBasePath}:${sanitizedFileName}`;

        return db
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
      })
      ?.filter((s) => s !== null) as unknown as [
      BatchItem<"sqlite">,
      ...BatchItem<"sqlite">[]
    ];

    if (filesToUpsert && filesToUpsert.length > 0) {
      try {
        await db.batch(filesToUpsert);
        finalMessage += ` ${filesToUpsert.length} files metadata saved/updated for version ${selectedVersion.id}.`;
      } catch (fileBatchError: any) {
        console.error(
          `Error saving files batch for version ${selectedVersion.id}:`,
          fileBatchError
        );
        errors.push(
          `Failed to save/update files metadata: ${fileBatchError.message}`
        );
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` Error saving files.`;
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
      const imageUpsertStatements = selectedVersion.images
        .map((imageData, index: number) => {
          if (!imageData.hash) {
            console.warn(
              `Image with URL ${imageData.url} is missing hash. Skipping upsert for this image.`
            );
            return null;
          }

          return db
            .insert(civitaiImages)
            .values({
              civitaiVersionId: savedCivitaiModelVersionId!,
              index,
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
                hasMeta: sql`excluded.hasMeta`,
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
          await db.batch(imageUpsertStatements);
          finalMessage += ` ${imageUpsertStatements.length} images metadata saved/updated for version ${selectedVersion.id}.`;
        } catch (imageBatchError: any) {
          console.error(
            `Error saving images batch for version ${selectedVersion.id}:`,
            imageBatchError
          );
          errors.push(
            `Failed to save/update images metadata: ${imageBatchError.message}`
          );
          finalStatus =
            finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` Error saving images.`;
        }
      } else {
        console.log(
          `No valid images found to save/update for version ${selectedVersion.id}.`
        );
      }
    } else if (savedCivitaiModelVersionId) {
      console.log(
        `No images found in payload for version ${selectedVersion.id}.`
      );
    } else {
    }

    let fileToDownload: FileVersion | undefined;

    if (requestedFileId !== undefined) {
      fileToDownload = selectedVersion.files?.find(
        (f) => f.id === requestedFileId
      );
      if (!fileToDownload) {
        const msg = `Requested file ID ${requestedFileId} not found in version ${selectedVersion.id}. Download skipped.`;
        console.warn(msg);
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
      } else if (!fileToDownload.downloadUrl) {
        const msg = `Requested file ID ${requestedFileId} has no download URL. Download skipped.`;
        console.warn(msg);
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
        fileToDownload = undefined;
      } else {
        console.log(
          `Identified requested file ${fileToDownload.id} for download.`
        );
      }
    } else {
      fileToDownload = selectedVersion.files?.find((f) => f.primary);
      if (!fileToDownload) {
        const msg = `No specific file ID requested and no primary file found in version ${selectedVersion.id}. Download skipped.`;
        console.warn(msg);
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
      } else if (!fileToDownload.downloadUrl) {
        const msg = `Primary file ID ${fileToDownload.id} has no download URL. Download skipped.`;
        console.warn(msg);
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
        fileToDownload = undefined;
      } else {
        console.log(
          `Identified primary file ${fileToDownload.id} for download.`
        );
      }
    }

    if (triggerDownload && fileToDownload) {
      const fileRecord = await db.query.civitaiFiles.findFirst({
        where: eq(civitaiFiles.id, fileToDownload.id),
        columns: { id: true, runpodPath: true },
      });

      if (!fileRecord) {
        const msg = `Could not find saved file record (Civitai ID ${fileToDownload.id}) to initiate install.`;
        console.error(msg);
        errors.push(msg);
        finalStatus =
          finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
        finalMessage += ` ${msg}`;
      } else if (isModelImageRebuildConfigured(env)) {
        try {
          const reusableInstall = await findReusableReadyModelImageInstall(
            db,
            savedCivitaiModelId!,
            fileToDownload.id,
          );

          if (reusableInstall?.imageName) {
            downloadInitiatedPath = fileRecord.runpodPath;
            if (type === "LORA") loraRunpodPath = downloadInitiatedPath;
            if (type === "TextualInversion")
              embeddingRunpodPath = downloadInitiatedPath;

            await db
              .update(civitaiModelInstalls)
              .set({
                status: "READY",
                statusMessage: `Docker image ${reusableInstall.imageName} is already ready for RunPod.`,
                buildTriggerId: reusableInstall.buildTriggerId,
                civitaiFileId: fileToDownload.id,
                runpodPath: fileRecord.runpodPath,
                imageName: reusableInstall.imageName,
                deployedAt: reusableInstall.deployedAt,
                buildTriggeredAt: reusableInstall.buildTriggeredAt,
                runpodJobId: null,
                updatedAt: new Date(),
              })
              .where(
                sql`${civitaiModelInstalls.userId} = ${userId} AND ${civitaiModelInstalls.civitaiModelId} = ${savedCivitaiModelId!}`,
              );

            finalMessage += ` Existing Docker image reused for file ${fileToDownload.name}.`;
          } else {
            const buildTriggerId =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${savedCivitaiModelId}-${fileToDownload.id}-${Date.now()}`;

            await triggerModelImageBuild(env, {
              buildTriggerId,
              civitaiModelId: savedCivitaiModelId!,
              civitaiFileId: fileToDownload.id,
              downloadUrl: fileToDownload.downloadUrl!,
              runpodPath: fileRecord.runpodPath,
              modelType: type,
            });

            downloadInitiatedPath = fileRecord.runpodPath;
            if (type === "LORA") loraRunpodPath = downloadInitiatedPath;
            if (type === "TextualInversion")
              embeddingRunpodPath = downloadInitiatedPath;

            await db
              .update(civitaiModelInstalls)
              .set({
                status: "BUILD_QUEUED",
                statusMessage:
                  "Model image rebuild queued. The model will be ready after the Docker image deploys.",
                buildTriggerId,
                civitaiFileId: fileToDownload.id,
                runpodPath: fileRecord.runpodPath,
                buildTriggeredAt: new Date(),
                runpodJobId: null,
                updatedAt: new Date(),
              })
              .where(
                sql`${civitaiModelInstalls.userId} = ${userId} AND ${civitaiModelInstalls.civitaiModelId} = ${savedCivitaiModelId!}`,
              );

            await db
              .update(civitaiFiles)
              .set({
                downloadStatus: "PENDING",
                downloadOutput: `Model image rebuild ${buildTriggerId} queued.`,
                runpodJobId: null,
                updatedAt: new Date(),
              })
              .where(eq(civitaiFiles.id, fileRecord.id));

            finalMessage += ` Model image rebuild queued for file ${fileToDownload.name}.`;
          }
        } catch (modelImageError: any) {
          const msg = `Error queueing model image rebuild for file ${
            fileToDownload.id
          }: ${modelImageError.message || "Unknown API error"}`;
          console.error(msg, modelImageError);
          errors.push(msg);
          finalStatus =
            finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` ${msg}`;

          await db
            .update(civitaiModelInstalls)
            .set({
              status: "BUILD_FAILED",
              statusMessage: msg,
              updatedAt: new Date(),
            })
            .where(
              sql`${civitaiModelInstalls.userId} = ${userId} AND ${civitaiModelInstalls.civitaiModelId} = ${savedCivitaiModelId!}`,
            );
        }
      } else {
      const runpodEndpointId = env.RUNPOD_DOWNLOADER_ID;
      const rawWebhookUrl = env.RUNPOD_WEBHOOK_URL;
      const runpodApiKey = env.RUNPOD_API_KEY;

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
          const runpod = runpodSdk(runpodApiKey);
          const endpoint = runpod.endpoint(runpodEndpointId);

          const webhookUrl = `${rawWebhookUrl}/downloader`;

            const runpodJob = await endpoint!.run({
              input: {
                save_path: fileRecord.runpodPath,
                download_url: fileToDownload.downloadUrl!,
                model_id: String(savedCivitaiModelId ?? ""),
                user_id: userId,
                civitai_file_id: fileToDownload.id,
                db_file_id: fileRecord.id,
                model_type: type,
                file_type: fileToDownload.type,
              },
              webhook: webhookUrl,
            });

            if (runpodJob?.id) {
              runpodJobId = runpodJob.id;
              downloadInitiatedPath = fileRecord.runpodPath;

              if (type === "LORA") loraRunpodPath = downloadInitiatedPath;
              if (type === "TextualInversion")
                embeddingRunpodPath = downloadInitiatedPath;

              console.log(
                `Download initiated for file ${fileToDownload.id} to ${downloadInitiatedPath} with RunPod job ID: ${runpodJobId}`
              );

              await db
                .update(civitaiFiles)
                .set({
                  runpodJobId: runpodJobId,
                  downloadStatus: "PENDING",
                  downloadOutput: `RunPod job ${runpodJobId} initiated.`,
                })
                .where(eq(civitaiFiles.id, fileRecord.id));

              if (userId) {
                await db
                  .update(civitaiModelInstalls)
                  .set({
                    status: "DOWNLOADING",
                    statusMessage: `RunPod download job ${runpodJobId} started.`,
                    runpodJobId,
                    civitaiFileId: fileToDownload.id,
                    runpodPath: fileRecord.runpodPath,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(civitaiModelInstalls.userId, userId),
                      eq(civitaiModelInstalls.civitaiModelId, savedCivitaiModelId!),
                    ),
                  );
              }

              finalMessage += ` Download initiated for file ${fileToDownload.name}. RunPod Job ID: ${runpodJobId}.`;

              if (["FAILED"].includes(finalStatus)) {
                finalStatus = "SUCCESS";
              }
            } else {
              const msg = `RunPod endpoint.run did not return a job ID for file ${fileToDownload.id}.`;
              console.error(msg, runpodJob);
              errors.push(msg);
              finalStatus =
                finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
              finalMessage += ` ${msg}`;

              await db
                .update(civitaiFiles)
                .set({
                  downloadStatus: "ERROR",
                  downloadOutput: msg,
                  runpodJobId: null,
                })
                .where(eq(civitaiFiles.id, fileRecord.id));
            }
        } catch (runpodError: any) {
          const msg = `Error initiating RunPod job for file ${
            fileToDownload.id
          }: ${runpodError.message || "Unknown API error"}`;
          console.error(msg, runpodError);
          errors.push(msg);
          finalStatus =
            finalStatus === "SUCCESS" ? "PARTIAL_SUCCESS" : finalStatus;
          finalMessage += ` ${msg}`;

          const fileRecord = await db.query.civitaiFiles.findFirst({
            where: eq(civitaiFiles.id, fileToDownload.id),
            columns: { id: true },
          });
          if (fileRecord) {
            await db
              .update(civitaiFiles)
              .set({
                downloadStatus: "ERROR",
                downloadOutput: msg,
                runpodJobId: null,
              })
              .where(eq(civitaiFiles.id, fileRecord.id));
          }

          if (userId && savedCivitaiModelId) {
            await db
              .update(civitaiModelInstalls)
              .set({
                status: "DOWNLOAD_FAILED",
                statusMessage: msg,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(civitaiModelInstalls.userId, userId),
                  eq(civitaiModelInstalls.civitaiModelId, savedCivitaiModelId),
                ),
              );
          }
        }
      }
      }
    } else if (triggerDownload) {
      if (["FAILED"].includes(finalStatus)) {
        finalStatus = "PARTIAL_SUCCESS";
      }
    } else {
      finalMessage += " Download not initiated per options.";
    }
  } catch (versionFileDataError: any) {
    console.error(
      `Error processing version/file/image data for model ${id}:`,
      versionFileDataError
    );
    errors.push(
      `Failed to process version/file/image data: ${versionFileDataError.message}`
    );

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
