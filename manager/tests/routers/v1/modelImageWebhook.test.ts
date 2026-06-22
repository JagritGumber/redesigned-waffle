import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import * as schema from "@/schema";

const client = new Database(":memory:");
const db = drizzle({ client, schema });

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

mock.module("@/db", () => ({ default: db }));
mock.module("@/s3", () => ({ default: { write: async () => undefined } }));
mock.module("@/utils/updateStorageInfo", () => ({
  updateStorageInfo: async () => ({ success: true }),
}));
mock.module("@/services/modelImageBuildService", () => ({
  triggerModelImageBuild: async () => ({
    triggered: false,
    buildTriggerId: null,
    message: "Model image rebuild was not triggered in test.",
  }),
}));

const { webhookRouter } = await import("@/routers/v1/webhookRouter");

function createApp() {
  return new Elysia().use(webhookRouter);
}

async function postModelImageWebhook(body: unknown, token = "test-webhook-token") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return createApp().handle(
    new Request("http://localhost/webhooks/model-image", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

async function postDownloaderWebhook(body: unknown) {
  return createApp().handle(
    new Request("http://localhost/webhooks/runpod/downloader", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /webhooks/model-image", () => {
  beforeAll(async () => {
    Bun.env.MODEL_IMAGE_WEBHOOK_TOKEN = "test-webhook-token";

    await db.insert(schema.civitaiModelInstalls).values([
      {
        id: "install-building",
        userId: "user-a",
        civitaiModelId: 101,
        status: "BUILDING",
        statusMessage: "Waiting for RunPod build.",
        buildTriggerId: "build-ready",
      },
      {
        id: "install-failing",
        userId: "user-b",
        civitaiModelId: 102,
        status: "BUILDING",
        statusMessage: "Waiting for RunPod build.",
        buildTriggerId: "build-failed",
      },
    ]);
  });

  it("rejects an invalid bearer token before updating install status", async () => {
    const response = await postModelImageWebhook(
      {
        buildTriggerId: "build-ready",
        status: "COMPLETED",
        image: "registry.runpod.io/example:model-build-ready",
      },
      "wrong-token",
    );

    expect(response.status).toBe(401);
    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.buildTriggerId, "build-ready"));
    expect(install.status).toBe("BUILDING");
  });

  it("returns 404 when no install matches the build trigger", async () => {
    const response = await postModelImageWebhook({
      buildTriggerId: "missing-build",
      status: "COMPLETED",
      image: "registry.runpod.io/example:model-missing-build",
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.message).toBe("No model install found for build trigger.");
  });

  it("marks an install ready when the Docker image build completes", async () => {
    const response = await postModelImageWebhook({
      buildTriggerId: "build-ready",
      status: "COMPLETED",
      image: "registry.runpod.io/example:model-build-ready",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.installsUpdated).toBe(1);

    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.buildTriggerId, "build-ready"));
    expect(install.status).toBe("READY");
    expect(install.statusMessage).toBe(
      "Docker image registry.runpod.io/example:model-build-ready is ready for RunPod.",
    );
    expect(install.imageName).toBe("registry.runpod.io/example:model-build-ready");
    expect(install.deployedAt).toBeInstanceOf(Date);
  });

  it("marks an install build failed when RunPod reports a failed image build", async () => {
    const response = await postModelImageWebhook({
      buildTriggerId: "build-failed",
      status: "FAILED",
      message: "RunPod build failed during testing.",
    });

    expect(response.status).toBe(200);

    const [install] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.buildTriggerId, "build-failed"));
    expect(install.status).toBe("BUILD_FAILED");
    expect(install.statusMessage).toBe("RunPod build failed during testing.");
    expect(install.deployedAt).toBeNull();
  });

  it("marks only the account install deleted when a legacy delete callback completes", async () => {
    await db.insert(schema.civitaiModels).values({
      id: 201,
      name: "Shared delete test model",
      description: "Shared global metadata.",
      type: "Checkpoint",
      nsfw: false,
      tags: ["safe"],
      creatorId: 1,
      status: null,
    });
    await db.insert(schema.civitaiModelInstalls).values([
      {
        id: "delete-install-a",
        userId: "delete-user-a",
        civitaiModelId: 201,
        status: "READY",
        runpodJobId: "delete-job-a",
      },
      {
        id: "delete-install-b",
        userId: "delete-user-b",
        civitaiModelId: 201,
        status: "READY",
        runpodJobId: "delete-job-b",
      },
    ]);

    const response = await postDownloaderWebhook({
      id: "delete-job-a",
      status: "COMPLETED",
      output: { status: "COMPLETED" },
      input: {
        action: "delete",
        model_id: 201,
        user_id: "delete-user-a",
      },
    });

    expect(response.status).toBe(200);

    const [userAInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.id, "delete-install-a"));
    const [userBInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.id, "delete-install-b"));
    const [model] = await db
      .select()
      .from(schema.civitaiModels)
      .where(eq(schema.civitaiModels.id, 201));

    expect(userAInstall.status).toBe("DELETED");
    expect(userAInstall.runpodJobId).toBeNull();
    expect(userBInstall.status).toBe("READY");
    expect(model.status).toBeNull();
  });

  it("deleteAll callback removes only the account installs", async () => {
    await db.insert(schema.civitaiModels).values({
      id: 202,
      name: "Shared delete all test model",
      description: "Shared global metadata.",
      type: "Checkpoint",
      nsfw: false,
      tags: ["safe"],
      creatorId: 1,
      status: null,
    });
    await db.insert(schema.civitaiModelInstalls).values([
      {
        id: "delete-all-install-a",
        userId: "delete-all-user-a",
        civitaiModelId: 202,
        status: "READY",
      },
      {
        id: "delete-all-install-b",
        userId: "delete-all-user-b",
        civitaiModelId: 202,
        status: "READY",
      },
    ]);

    const response = await postDownloaderWebhook({
      id: "delete-all-job-a",
      status: "COMPLETED",
      output: { status: "COMPLETED", storage_used: 0 },
      input: {
        action: "deleteAll",
        user_id: "delete-all-user-a",
      },
    });

    expect(response.status).toBe(200);

    const remainingInstalls = await db.select().from(schema.civitaiModelInstalls);
    const [model] = await db
      .select()
      .from(schema.civitaiModels)
      .where(eq(schema.civitaiModels.id, 202));

    expect(remainingInstalls.some((install) => install.id === "delete-all-install-a")).toBe(false);
    expect(remainingInstalls.some((install) => install.id === "delete-all-install-b")).toBe(true);
    expect(model.status).toBeNull();
  });
});
