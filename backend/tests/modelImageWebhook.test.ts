import { describe, it, expect, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import webhookRouter from "@/routers/v1/webhookRouter";
import { civitaiModelInstalls } from "@/schema/modelInstall";
import { civitaiFiles } from "@/schema/modelFiles";
import { civitaiModels } from "@/schema/models";

const client = new Database(":memory:");
const db = drizzle(client);

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
    updatedAt INTEGER
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
  CREATE TABLE storage_info (
    id INTEGER PRIMARY KEY,
    total_storage_bytes INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER
  )
`);

function createApp() {
  const app = new Hono()
    .use("*", async (c, next) => {
      c.set("db", db);
      await next();
    })
    .route("/webhooks", webhookRouter as any);

  return app;
}

async function postDownloaderWebhook(body: unknown, env: Record<string, string> = {}) {
  return createApp().request(
    "/webhooks/runpod/downloader",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function postModelImageWebhook(body: unknown, token = "test-webhook-token") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return createApp().request(
    "/webhooks/model-image",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    {
      MODEL_IMAGE_WEBHOOK_TOKEN: "test-webhook-token",
    },
  );
}

describe("Worker POST /webhooks/model-image", () => {
  beforeAll(async () => {
    await db.insert(civitaiModelInstalls).values([
      {
        id: "worker-install-ready",
        userId: "user-a",
        civitaiModelId: 101,
        status: "BUILDING",
        statusMessage: "Waiting for RunPod build.",
        buildTriggerId: "worker-build-ready",
      },
      {
        id: "worker-install-failed",
        userId: "user-b",
        civitaiModelId: 102,
        status: "BUILDING",
        statusMessage: "Waiting for RunPod build.",
        buildTriggerId: "worker-build-failed",
      },
    ]);
  });

  it("rejects an invalid bearer token before updating install status", async () => {
    const response = await postModelImageWebhook(
      {
        buildTriggerId: "worker-build-ready",
        status: "COMPLETED",
        image: "registry.runpod.io/example:model-worker-build-ready",
      },
      "wrong-token",
    );

    expect(response.status).toBe(401);
    const [install] = await db
      .select()
      .from(civitaiModelInstalls)
      .where(eq(civitaiModelInstalls.buildTriggerId, "worker-build-ready"));
    expect(install.status).toBe("BUILDING");
  });

  it("marks an install ready when the RunPod image build completes", async () => {
    const response = await postModelImageWebhook({
      buildTriggerId: "worker-build-ready",
      status: "COMPLETED",
      image: "registry.runpod.io/example:model-worker-build-ready",
    });

    expect(response.status).toBe(200);

    const [install] = await db
      .select()
      .from(civitaiModelInstalls)
      .where(eq(civitaiModelInstalls.buildTriggerId, "worker-build-ready"));
    expect(install.status).toBe("READY");
    expect(install.statusMessage).toBe(
      "Docker image registry.runpod.io/example:model-worker-build-ready is ready for RunPod.",
    );
    expect(install.imageName).toBe("registry.runpod.io/example:model-worker-build-ready");
    expect(install.deployedAt).toBeInstanceOf(Date);
  });

  it("marks an install build failed when RunPod reports a failed image build", async () => {
    const response = await postModelImageWebhook({
      buildTriggerId: "worker-build-failed",
      status: "FAILED",
      message: "RunPod build failed during testing.",
    });

    expect(response.status).toBe(200);

    const [install] = await db
      .select()
      .from(civitaiModelInstalls)
      .where(eq(civitaiModelInstalls.buildTriggerId, "worker-build-failed"));
    expect(install.status).toBe("BUILD_FAILED");
    expect(install.statusMessage).toBe("RunPod build failed during testing.");
    expect(install.deployedAt).toBeNull();
  });

  it("queues a model image rebuild when the legacy downloader completes", async () => {
    await db.insert(civitaiFiles).values({
      id: 501,
      civitaiVersionId: 401,
      name: "worker-downloaded-model.safetensors",
      sizeKB: 1024,
      downloadUrl: "https://civitai.com/api/download/models/501",
      runpodPath: "/runpod-volume/workspace/models/worker-downloaded-model.safetensors",
      runpodJobId: "legacy-download-job-1",
    });
    await db.insert(civitaiModelInstalls).values({
      id: "worker-legacy-download-install",
      userId: "user-legacy-download",
      civitaiModelId: 301,
      status: "DOWNLOADING",
      runpodJobId: "legacy-download-job-1",
      civitaiFileId: 501,
      runpodPath: "/runpod-volume/workspace/models/worker-downloaded-model.safetensors",
    });

    const originalFetch = globalThis.fetch;
    let dispatchedBody: any;
    globalThis.fetch = (async (_url, init) => {
      dispatchedBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      const response = await postDownloaderWebhook(
        {
          id: "legacy-download-job-1",
          status: "COMPLETED",
          output: { status: "COMPLETED", storage_used: 1024 },
          input: {
            action: "download",
            model_id: 301,
            civitai_file_id: 501,
            model_type: "Checkpoint",
          },
        },
        {
          MODEL_IMAGE_REBUILD_PROVIDER: "github",
          MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA: "true",
          MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY: "owner/repo",
          MODEL_IMAGE_REBUILD_GITHUB_TOKEN: "test-token",
        },
      );

      expect(response.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(dispatchedBody.event_type).toBe("model-image-rebuild");
    expect(dispatchedBody.client_payload).toMatchObject({
      event: "model.downloaded",
      civitaiModelId: 301,
      civitaiFileId: 501,
      downloadUrl: "https://civitai.com/api/download/models/501",
      runpodPath: "/runpod-volume/workspace/models/worker-downloaded-model.safetensors",
    });

    const [install] = await db
      .select()
      .from(civitaiModelInstalls)
      .where(eq(civitaiModelInstalls.runpodJobId, "legacy-download-job-1"));
    expect(install.status).toBe("BUILD_QUEUED");
    expect(install.statusMessage).toBe(
      "Model image rebuild queued. The model will be ready after the Docker image deploys.",
    );
    expect(install.buildTriggerId).toBeTruthy();
    expect(install.downloadCompletedAt).toBeInstanceOf(Date);
    expect(install.buildTriggeredAt).toBeInstanceOf(Date);
  });

  it("marks only the account install deleted when a legacy delete callback completes", async () => {
    await db.insert(civitaiModels).values({
      id: 601,
      name: "Worker shared delete test model",
      description: "Shared global metadata.",
      type: "Checkpoint",
      nsfw: false,
      tags: ["safe"],
      creatorId: 1,
      status: null,
    });
    await db.insert(civitaiModelInstalls).values([
      {
        id: "worker-delete-install-a",
        userId: "worker-delete-user-a",
        civitaiModelId: 601,
        status: "READY",
        runpodJobId: "worker-delete-job-a",
      },
      {
        id: "worker-delete-install-b",
        userId: "worker-delete-user-b",
        civitaiModelId: 601,
        status: "READY",
        runpodJobId: "worker-delete-job-b",
      },
    ]);

    const response = await postDownloaderWebhook({
      id: "worker-delete-job-a",
      status: "COMPLETED",
      output: { status: "COMPLETED" },
      input: {
        action: "delete",
        model_id: 601,
        user_id: "worker-delete-user-a",
      },
    });

    expect(response.status).toBe(200);

    const [userAInstall] = await db
      .select()
      .from(civitaiModelInstalls)
      .where(eq(civitaiModelInstalls.id, "worker-delete-install-a"));
    const [userBInstall] = await db
      .select()
      .from(civitaiModelInstalls)
      .where(eq(civitaiModelInstalls.id, "worker-delete-install-b"));
    const [model] = await db
      .select()
      .from(civitaiModels)
      .where(eq(civitaiModels.id, 601));

    expect(userAInstall.status).toBe("DELETED");
    expect(userAInstall.runpodJobId).toBeNull();
    expect(userBInstall.status).toBe("READY");
    expect(model.status).toBeNull();
  });

  it("deleteAll callback removes only the Worker account installs", async () => {
    await db.insert(civitaiModels).values({
      id: 602,
      name: "Worker shared delete all test model",
      description: "Shared global metadata.",
      type: "Checkpoint",
      nsfw: false,
      tags: ["safe"],
      creatorId: 1,
      status: null,
    });
    await db.insert(civitaiModelInstalls).values([
      {
        id: "worker-delete-all-install-a",
        userId: "worker-delete-all-user-a",
        civitaiModelId: 602,
        status: "READY",
      },
      {
        id: "worker-delete-all-install-b",
        userId: "worker-delete-all-user-b",
        civitaiModelId: 602,
        status: "READY",
      },
    ]);

    const response = await postDownloaderWebhook({
      id: "worker-delete-all-job-a",
      status: "COMPLETED",
      output: { status: "COMPLETED", storage_used: 0 },
      input: {
        action: "deleteAll",
        user_id: "worker-delete-all-user-a",
      },
    });

    expect(response.status).toBe(200);

    const remainingInstalls = await db.select().from(civitaiModelInstalls);
    const [model] = await db
      .select()
      .from(civitaiModels)
      .where(eq(civitaiModels.id, 602));

    expect(
      remainingInstalls.some((install) => install.id === "worker-delete-all-install-a"),
    ).toBe(false);
    expect(
      remainingInstalls.some((install) => install.id === "worker-delete-all-install-b"),
    ).toBe(true);
    expect(model.status).toBeNull();
  });
});
