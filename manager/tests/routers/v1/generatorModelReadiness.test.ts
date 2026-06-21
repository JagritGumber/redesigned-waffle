import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sql } from "drizzle-orm";
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
    updatedAt INTEGER,
    UNIQUE(userId, civitaiModelId)
  )
`);

mock.module("@/db", () => ({ default: db }));
mock.module("@/utils/auth", () => ({
  requireUserId: async (request: Request, set: { status?: number }) => {
    const userId = request.headers.get("x-test-user-id");
    if (!userId) {
      set.status = 401;
      return null;
    }
    return userId;
  },
}));
mock.module("runpod-sdk", () => ({
  default: () => {
    throw new Error("RunPod should not be called for models that are not ready.");
  },
}));

const { generatorRouter } = await import("@/routers/v1/generatorRouter");

function createApp() {
  return new Elysia().use(generatorRouter);
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

describe("generator model readiness", () => {
  it("rejects generation while a selected account model is still installing", async () => {
    Bun.env.RUNPOD_API_KEY = "test-runpod-key";
    Bun.env.RUNPOD_GENERATOR_ID = "test-generator";
    Bun.env.RUNPOD_WEBHOOK_URL = "http://localhost/api/v1/webhooks/runpod";

    await db.insert(schema.civitaiModelInstalls).values({
      id: "install-building",
      userId: "user-a",
      civitaiModelId: 1001,
      status: "BUILDING",
      statusMessage: "RunPod image build is still running.",
    });

    const response = await createApp().handle(
      new Request("http://localhost/generator/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": "user-a",
        },
        body: JSON.stringify(generationPayload(1001)),
      }),
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
});
