import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/schema";

const client = new Database(":memory:");
const db = drizzle({ client, schema });
(db as any).batch = async (statements: Array<Promise<unknown>>) => Promise.all(statements);

db.run(sql`
  CREATE TABLE civitaiCreator (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    image TEXT,
    modelCount INTEGER,
    link TEXT
  )
`);

db.run(sql`
  CREATE TABLE civitaiModel (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    nsfw INTEGER NOT NULL,
    tags TEXT NOT NULL,
    mode TEXT,
    creatorId INTEGER NOT NULL,
    createdAt INTEGER,
    updatedAt INTEGER,
    defaultWeight REAL DEFAULT 0.6,
    status TEXT,
    statusMessage TEXT,
    runpodJobId TEXT,
    buildTriggerId TEXT,
    imageName TEXT,
    buildTriggeredAt INTEGER,
    deployedAt INTEGER,
    userId TEXT
  )
`);

db.run(sql`
  CREATE TABLE civitaiModelVersion (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    downloadUrl TEXT NOT NULL,
    trainedWords TEXT,
    civitaiModelId INTEGER NOT NULL,
    "index" INTEGER,
    baseModel TEXT,
    baseModelType TEXT,
    publishedAt TEXT,
    availability TEXT,
    nsfwLevel INTEGER,
    supportsGeneration INTEGER,
    statsDownloadCount INTEGER,
    statsFavoriteCount INTEGER,
    statsRating REAL,
    createdAt INTEGER,
    updatedAt INTEGER,
    required INTEGER NOT NULL DEFAULT 0
  )
`);

db.run(sql`
  CREATE TABLE civitaiFile (
    id INTEGER PRIMARY KEY,
    civitaiVersionId INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    sizeKB INTEGER NOT NULL,
    pickleScanResult TEXT,
    pickleScanMessage TEXT,
    virusScanResult TEXT,
    virusScanMessage TEXT,
    scannedAt INTEGER,
    downloadStatus TEXT,
    downloadOutput TEXT,
    downloadUrl TEXT NOT NULL,
    runpodPath TEXT NOT NULL,
    createdAt INTEGER,
    updatedAt INTEGER,
    runpodJobId TEXT
  )
`);

db.run(sql`
  CREATE TABLE civitaiImage (
    id INTEGER PRIMARY KEY,
    civitaiVersionId INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    url TEXT NOT NULL,
    nsfw INTEGER,
    nsfwLevel INTEGER NOT NULL,
    height INTEGER NOT NULL,
    width INTEGER NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    hasMeta INTEGER,
    createdAt INTEGER,
    metaId INTEGER,
    updatedAt INTEGER
  )
`);

db.run(sql`
  CREATE TABLE civitaiModelInstall (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    civitaiModelId INTEGER NOT NULL,
    defaultWeight REAL DEFAULT 0.6,
    status TEXT DEFAULT 'READY',
    runpodJobId TEXT,
    civitaiFileId INTEGER,
    runpodPath TEXT,
    statusMessage TEXT,
    buildTriggerId TEXT,
    imageName TEXT,
    downloadCompletedAt INTEGER,
    buildTriggeredAt INTEGER,
    deployedAt INTEGER,
    createdAt INTEGER,
    updatedAt INTEGER,
    UNIQUE(userId, civitaiModelId)
  )
`);

const triggeredBuilds: Array<{
  buildTriggerId: string;
  civitaiModelId: number;
  civitaiFileId: number;
  downloadUrl: string;
  runpodPath: string;
  modelType: string;
}> = [];

mock.module("@/services/modelImageBuildService", () => ({
  isModelImageRebuildConfigured: () => true,
  triggerModelImageBuild: async (_env: unknown, input: (typeof triggeredBuilds)[number]) => {
    triggeredBuilds.push(input);
    return {
      provider: "github",
      triggerId: input.buildTriggerId,
      status: "BUILD_QUEUED",
    };
  },
}));

const { registerOrUpdateCivitaiModel } = await import("@/services/civitaiService");

describe("Worker registerOrUpdateCivitaiModel model image lifecycle", () => {
  const env = {
    MODEL_IMAGE_REBUILD_PROVIDER: "github",
    MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY: "owner/repo",
    MODEL_IMAGE_REBUILD_GITHUB_TOKEN: "test-token",
  };
  const safeModelData = {
    id: 9301,
    name: "Worker Safe Model",
    description: "A safe Worker model for testing.",
    type: "Checkpoint",
    nsfw: false,
    creator: {
      username: "worker-safe-creator",
      image: "https://example.com/avatar.png",
    },
    tags: ["safe", "worker"],
    modelVersions: [
      {
        id: 9401,
        index: 0,
        name: "v1",
        baseModel: "SD 1.5",
        baseModelType: "Standard",
        publishedAt: "2026-01-01T00:00:00.000Z",
        availability: "Public",
        nsfwLevel: 1,
        description: "Version description.",
        trainedWords: [],
        supportsGeneration: true,
        downloadUrl: "https://civitai.com/api/download/models/9401",
        files: [
          {
            id: 9501,
            name: "worker-safe-model.safetensors",
            type: "Model",
            sizeKB: 1024,
            pickleScanResult: "Success",
            pickleScanMessage: "Safe",
            virusScanResult: "Success",
            virusScanMessage: "Safe",
            scannedAt: "2026-01-01T00:00:00.000Z",
            downloadUrl: "https://civitai.com/api/download/models/9501",
          },
        ],
        images: [
          {
            url: "https://example.com/worker-image.png",
            nsfwLevel: 1,
            width: 512,
            height: 512,
            hash: "worker-safe-image-hash",
            hasMeta: false,
          },
        ],
      },
    ],
  } as any;

  it("creates an account-scoped install and queues the serverless model image rebuild", async () => {
    const result = await registerOrUpdateCivitaiModel(
      db as any,
      env,
      safeModelData,
      {
        userId: "worker-user-a",
        versionId: 9401,
        fileId: 9501,
        triggerDownload: true,
      },
    );

    expect(result.status).toBe("SUCCESS");
    expect(result.dbModelId).toBe(9301);
    expect(result.message).toContain("Model image rebuild queued");
    expect(result.installStatus).toBe("BUILD_QUEUED");
    expect(result.statusMessage).toBe(
      "Model image rebuild queued. The model will be ready after the Docker image deploys.",
    );
    expect(result.buildTriggerId).toBeTruthy();
    expect(result.civitaiFileId).toBe(9501);
    expect(result.runpodPath).toContain("/runpod-volume/workspace/models/");
    expect(result.buildTriggeredAt).toBeInstanceOf(Date);

    expect(triggeredBuilds).toHaveLength(1);
    expect(triggeredBuilds[0]).toMatchObject({
      civitaiModelId: 9301,
      civitaiFileId: 9501,
      downloadUrl: "https://civitai.com/api/download/models/9501",
      modelType: "Checkpoint",
    });
    expect(triggeredBuilds[0].runpodPath).toContain("/runpod-volume/workspace/models/");

    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "worker-user-a"));

    expect(install.civitaiModelId).toBe(9301);
    expect(install.status).toBe("BUILD_QUEUED");
    expect(install.statusMessage).toBe(
      "Model image rebuild queued. The model will be ready after the Docker image deploys.",
    );
    expect(install.buildTriggerId).toBe(triggeredBuilds[0].buildTriggerId);
    expect(install.civitaiFileId).toBe(9501);
    expect(install.runpodPath).toBe(triggeredBuilds[0].runpodPath);
    expect(install.runpodJobId).toBeNull();
    expect(install.buildTriggeredAt).toBeInstanceOf(Date);

    const deployedAt = new Date("2026-06-22T00:00:00.000Z");
    await db
      .update(schema.civitaiModelInstalls)
      .set({
        status: "READY",
        statusMessage: "Ready for RunPod.",
        imageName: "registry.runpod.io/example:model-worker-build-ready",
        deployedAt,
      })
      .where(eq(schema.civitaiModelInstalls.userId, "worker-user-a"));

    const userARepeatResult = await registerOrUpdateCivitaiModel(
      db as any,
      env,
      safeModelData,
      {
        userId: "worker-user-a",
        versionId: 9401,
        fileId: 9501,
        triggerDownload: true,
      },
    );

    expect(userARepeatResult.status).toBe("SUCCESS");
    expect(userARepeatResult.message).toContain("Existing Docker image reused");
    expect(userARepeatResult.installStatus).toBe("READY");
    expect(userARepeatResult.imageName).toBe("registry.runpod.io/example:model-worker-build-ready");
    expect(userARepeatResult.deployedAt).toEqual(deployedAt);
    expect(triggeredBuilds).toHaveLength(1);

    const userBResult = await registerOrUpdateCivitaiModel(
      db as any,
      env,
      safeModelData,
      {
        userId: "worker-user-b",
        versionId: 9401,
        fileId: 9501,
        triggerDownload: true,
      },
    );

    expect(userBResult.status).toBe("SUCCESS");
    expect(userBResult.message).toContain("Existing Docker image reused");
    expect(userBResult.installStatus).toBe("READY");
    expect(userBResult.buildTriggerId).toBe(triggeredBuilds[0].buildTriggerId);
    expect(userBResult.imageName).toBe("registry.runpod.io/example:model-worker-build-ready");
    expect(triggeredBuilds).toHaveLength(1);

    const [userBInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "worker-user-b"));

    expect(userBInstall.status).toBe("READY");
    expect(userBInstall.buildTriggerId).toBe(triggeredBuilds[0].buildTriggerId);
    expect(userBInstall.civitaiFileId).toBe(9501);
    expect(userBInstall.imageName).toBe("registry.runpod.io/example:model-worker-build-ready");
    expect(userBInstall.deployedAt).toEqual(deployedAt);

    const [userARepeatInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "worker-user-a"));

    expect(userARepeatInstall.status).toBe("READY");
    expect(userARepeatInstall.imageName).toBe("registry.runpod.io/example:model-worker-build-ready");
    expect(userARepeatInstall.deployedAt).toEqual(deployedAt);
  });

  it("does not leave an account install READY when the requested file is invalid", async () => {
    const result = await registerOrUpdateCivitaiModel(
      db as any,
      env,
      safeModelData,
      {
        userId: "worker-user-invalid-file",
        versionId: 9401,
        fileId: 999999,
        triggerDownload: true,
      },
    );

    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.message).toContain("Requested file ID 999999 not found");
    expect(result.installStatus).toBe("DOWNLOAD_FAILED");
    expect(result.statusMessage).toContain("Requested file ID 999999 not found");
    expect(result.buildTriggerId).toBeNull();

    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "worker-user-invalid-file"));

    expect(install.status).toBe("DOWNLOAD_FAILED");
    expect(install.statusMessage).toContain("Requested file ID 999999 not found");
    expect(install.buildTriggerId).toBeNull();
    expect(triggeredBuilds).toHaveLength(1);
  });

  it("does not leave an account install active when the requested version is missing", async () => {
    const result = await registerOrUpdateCivitaiModel(
      db as any,
      env,
      {
        ...safeModelData,
        id: 9302,
        name: "Worker Missing Version Model",
        creator: {
          ...safeModelData.creator,
          username: "worker-missing-version-creator",
        },
      },
      {
        userId: "worker-user-invalid-version",
        versionId: 999999,
        fileId: 9501,
        triggerDownload: true,
      },
    );

    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.message).toContain("Requested version ID 999999 not found");
    expect(result.installStatus).toBe("DOWNLOAD_FAILED");
    expect(result.statusMessage).toContain("Requested version ID 999999 not found");
    expect(result.buildTriggerId).toBeNull();

    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "worker-user-invalid-version"));

    expect(install.status).toBe("DOWNLOAD_FAILED");
    expect(install.statusMessage).toContain("Requested version ID 999999 not found");
  });
});
