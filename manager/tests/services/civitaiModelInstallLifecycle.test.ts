import { beforeAll, describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/schema";

const client = new Database(":memory:");
const db = drizzle({ client, schema });

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
    runpodJobId TEXT
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
    "primary" INTEGER DEFAULT 0,
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
  civitaiModelId: number;
  civitaiFileId: number;
  downloadUrl: string;
  runpodPath: string;
}> = [];

mock.module("@/db", () => ({ default: db }));
mock.module("@/services/modelImageBuildService", () => ({
  triggerModelImageBuild: async (input: (typeof triggeredBuilds)[number]) => {
    triggeredBuilds.push(input);
    return {
      triggered: true,
      buildTriggerId: "build-user-a-model-9001",
      message: "Private model image rebuild queued.",
    };
  },
}));

const { registerOrUpdateCivitaiModel } = await import("@/services/civitaiService");

describe("registerOrUpdateCivitaiModel preferred model image lifecycle", () => {
  beforeAll(() => {
    Bun.env.MODEL_IMAGE_REBUILD_PROVIDER = "mirror";
    Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PATH = "D:/private/redesigned-waffle-deploy";
  });

  it("creates an account-scoped install and queues the cacheable Docker model build", async () => {
    const safeModelData = {
      id: 9001,
      name: "Safe Model",
      description: "A safe model for testing.",
      type: "Checkpoint",
      nsfw: false,
      creator: {
        username: "safe-creator",
        image: "https://example.com/avatar.png",
      },
      tags: ["safe", "test"],
      modelVersions: [
        {
          id: 9101,
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
          downloadUrl: "https://civitai.com/api/download/models/9101",
          files: [
            {
              id: 9201,
              name: "safe-model.safetensors",
              type: "Model",
              sizeKB: 1024,
              primary: true,
              pickleScanResult: "Success",
              pickleScanMessage: "Safe",
              virusScanResult: "Success",
              virusScanMessage: "Safe",
              scannedAt: "2026-01-01T00:00:00.000Z",
              downloadUrl: "https://civitai.com/api/download/models/9201",
            },
          ],
          images: [
            {
              url: "https://example.com/image.png",
              nsfwLevel: 1,
              width: 512,
              height: 512,
              hash: "safe-image-hash",
              hasMeta: false,
            },
          ],
        },
      ],
    } as any;

    const result = await registerOrUpdateCivitaiModel(
      safeModelData,
      {
        userId: "user-a",
        versionId: 9101,
        fileId: 9201,
        triggerDownload: true,
      },
    );

    expect(result.status).toBe("SUCCESS");
    expect(result.dbModelId).toBe(9001);
    expect(result.message).toContain("Docker image rebuild queued");
    expect(result.installStatus).toBe("BUILD_QUEUED");
    expect(result.statusMessage).toBe(
      "Docker image build queued. The model will be downloaded as a cacheable image layer.",
    );
    expect(result.buildTriggerId).toBe("build-user-a-model-9001");
    expect(result.civitaiFileId).toBe(9201);
    expect(result.runpodPath).toContain("/runpod-volume/workspace/models/");
    expect(result.buildTriggeredAt).toBeInstanceOf(Date);

    expect(triggeredBuilds).toHaveLength(1);
    expect(triggeredBuilds[0]).toMatchObject({
      civitaiModelId: 9001,
      civitaiFileId: 9201,
      downloadUrl: "https://civitai.com/api/download/models/9201",
    });
    expect(triggeredBuilds[0].runpodPath).toContain("/runpod-volume/workspace/models/");

    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "user-a"));

    expect(install.civitaiModelId).toBe(9001);
    expect(install.status).toBe("BUILD_QUEUED");
    expect(install.statusMessage).toBe(
      "Docker image build queued. The model will be downloaded as a cacheable image layer.",
    );
    expect(install.buildTriggerId).toBe("build-user-a-model-9001");
    expect(install.civitaiFileId).toBe(9201);
    expect(install.runpodPath).toBe(triggeredBuilds[0].runpodPath);
    expect(install.buildTriggeredAt).toBeInstanceOf(Date);

    const userQueuedResult = await registerOrUpdateCivitaiModel(
      safeModelData,
      {
        userId: "user-queued",
        versionId: 9101,
        fileId: 9201,
        triggerDownload: true,
      },
    );

    expect(userQueuedResult.status).toBe("SUCCESS");
    expect(userQueuedResult.message).toContain("Existing Docker image build reused");
    expect(userQueuedResult.installStatus).toBe("BUILD_QUEUED");
    expect(userQueuedResult.buildTriggerId).toBe("build-user-a-model-9001");
    expect(triggeredBuilds).toHaveLength(1);

    const [queuedInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "user-queued"));

    expect(queuedInstall.status).toBe("BUILD_QUEUED");
    expect(queuedInstall.buildTriggerId).toBe("build-user-a-model-9001");
    expect(queuedInstall.civitaiFileId).toBe(9201);
    expect(queuedInstall.runpodPath).toBe(triggeredBuilds[0].runpodPath);

    const deployedAt = new Date("2026-06-22T00:00:00.000Z");
    await db
      .update(schema.civitaiModelInstalls)
      .set({
        status: "READY",
        statusMessage: "Ready for RunPod.",
        imageName: "registry.runpod.io/example:model-build-user-a-model-9001",
        deployedAt,
      })
      .where(eq(schema.civitaiModelInstalls.userId, "user-a"));

    const userARepeatResult = await registerOrUpdateCivitaiModel(
      safeModelData,
      {
        userId: "user-a",
        versionId: 9101,
        fileId: 9201,
        triggerDownload: true,
      },
    );

    expect(userARepeatResult.status).toBe("SUCCESS");
    expect(userARepeatResult.message).toContain("Existing Docker image reused");
    expect(userARepeatResult.installStatus).toBe("READY");
    expect(userARepeatResult.imageName).toBe("registry.runpod.io/example:model-build-user-a-model-9001");
    expect(userARepeatResult.deployedAt).toEqual(deployedAt);
    expect(triggeredBuilds).toHaveLength(1);

    const userBResult = await registerOrUpdateCivitaiModel(
      safeModelData,
      {
        userId: "user-b",
        versionId: 9101,
        fileId: 9201,
        triggerDownload: true,
      },
    );

    expect(userBResult.status).toBe("SUCCESS");
    expect(userBResult.message).toContain("Existing Docker image reused");
    expect(userBResult.installStatus).toBe("READY");
    expect(userBResult.buildTriggerId).toBe("build-user-a-model-9001");
    expect(userBResult.imageName).toBe("registry.runpod.io/example:model-build-user-a-model-9001");
    expect(triggeredBuilds).toHaveLength(1);

    const [userBInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "user-b"));

    expect(userBInstall.status).toBe("READY");
    expect(userBInstall.buildTriggerId).toBe("build-user-a-model-9001");
    expect(userBInstall.civitaiFileId).toBe(9201);
    expect(userBInstall.imageName).toBe("registry.runpod.io/example:model-build-user-a-model-9001");
    expect(userBInstall.deployedAt).toEqual(deployedAt);

    const [userARepeatInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "user-a"));

    expect(userARepeatInstall.status).toBe("READY");
    expect(userARepeatInstall.imageName).toBe("registry.runpod.io/example:model-build-user-a-model-9001");
    expect(userARepeatInstall.deployedAt).toEqual(deployedAt);
  });

  it("marks the account install failed when the requested version is missing", async () => {
    const result = await registerOrUpdateCivitaiModel(
      {
        id: 9002,
        name: "Missing Version Model",
        description: "A safe model with a missing requested version.",
        type: "Checkpoint",
        nsfw: false,
        creator: {
          username: "missing-version-creator",
          image: "https://example.com/avatar.png",
        },
        tags: ["safe", "test"],
        modelVersions: [
          {
            id: 9102,
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
            downloadUrl: "https://civitai.com/api/download/models/9102",
            files: [],
            images: [],
          },
        ],
      } as any,
      {
        userId: "user-missing-version",
        versionId: 999999,
        fileId: 9201,
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
      .where(eq(schema.civitaiModelInstalls.userId, "user-missing-version"));

    expect(install.status).toBe("DOWNLOAD_FAILED");
    expect(install.statusMessage).toContain("Requested version ID 999999 not found");
  });
});
