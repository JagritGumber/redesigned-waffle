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
});
