import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "@/schema";
import type { ContextForHono } from "@/types/context";

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
    updatedAt INTEGER,
    UNIQUE(userId, civitaiModelId)
  )
`);

mock.module("@hono/auth-js", () => ({
  verifyAuth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
mock.module("@/utils/auth", () => ({
  getRequiredUserId: (c: any) => c.req.header("x-test-user-id") ?? null,
}));
mock.module("runpod-sdk", () => ({
  default: () => {
    throw new Error("RunPod should not be called for models that are not ready.");
  },
}));

const generatorRouter = (await import("@/routers/v1/generatorRouter")).default;

function createApp() {
  return new Hono<ContextForHono>()
    .use("*", async (c, next) => {
      c.set("db", db as any);
      await next();
    })
    .route("/generator", generatorRouter);
}

function generationPayload(modelId: number) {
  return {
    checkpoint: { modelId, modelVersionId: 2001, weight: 0.6 },
    loras: [],
    textualInversions: [],
    numImages: 1,
    prompt: "safe studio portrait",
    negativePrompt: "",
    width: 512,
    height: 512,
    steps: 25,
    seed: 123,
  };
}

describe("Worker generator model readiness", () => {
  it("rejects Solid-compatible generation route while a selected account model is still installing", async () => {
    await db.insert(schema.civitaiModelInstalls).values({
      id: "install-building",
      userId: "user-a",
      civitaiModelId: 1001,
      status: "BUILDING",
      statusMessage: "RunPod image build is still running.",
    });

    const response = await createApp().fetch(
      new Request("http://localhost/generator/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": "user-a",
        },
        body: JSON.stringify(generationPayload(1001)),
      }),
      {
        RUNPOD_API_KEY: "test-runpod-key",
        RUNPOD_GENERATOR_ID: "test-generator",
        RUNPOD_WEBHOOK_URL: "http://localhost/api/v1/webhooks/runpod",
      } as any,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("One or more selected models are still being installed for this account.");
    expect(body.models).toEqual([
      {
        modelId: 1001,
        installStatus: "BUILDING",
        statusMessage: "RunPod image build is still running.",
      },
    ]);
  });

  it("keeps the legacy Worker generation route as an alias", async () => {
    await db.insert(schema.civitaiModelInstalls).values({
      id: "install-building-legacy",
      userId: "user-b",
      civitaiModelId: 1002,
      status: "BUILDING",
      statusMessage: "RunPod image build is still running.",
    });

    const response = await createApp().fetch(
      new Request("http://localhost/generator/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": "user-b",
        },
        body: JSON.stringify(generationPayload(1002)),
      }),
      {
        RUNPOD_API_KEY: "test-runpod-key",
        RUNPOD_GENERATOR_ID: "test-generator",
        RUNPOD_WEBHOOK_URL: "http://localhost/api/v1/webhooks/runpod",
      } as any,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.models[0].modelId).toBe(1002);
  });
});
