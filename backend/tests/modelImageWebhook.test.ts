import { describe, it, expect, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import webhookRouter from "@/routers/v1/webhookRouter";
import { civitaiModelInstalls } from "@/schema/modelInstall";

const client = new Database(":memory:");
const db = drizzle(client);

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

function createApp() {
  const app = new Hono()
    .use("*", async (c, next) => {
      c.set("db", db);
      await next();
    })
    .route("/webhooks", webhookRouter as any);

  return app;
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
});
