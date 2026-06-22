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
  CREATE TABLE user (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    emailVerified INTEGER,
    image TEXT,
    password TEXT NOT NULL
  )
`);

db.run(sql`
  CREATE TABLE generator_prompts (
    id TEXT PRIMARY KEY,
    runpod_job_id TEXT,
    userId TEXT,
    status TEXT NOT NULL,
    input_payload TEXT NOT NULL,
    output_payload TEXT,
    error_message TEXT,
    error_details TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  )
`);

mock.module("@hono/auth-js", () => ({
  verifyAuth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
mock.module("@/utils/auth", () => ({
  getRequiredUserId: (c: any) => c.req.header("x-test-user-id") ?? null,
}));
mock.module("runpod-sdk", () => ({
  default: () => ({
    endpoint: () => ({
      run: async (payload: any) => {
        expect(payload.input.job_type).toBe("generate_prompt");
        expect(payload.input.data.prompt).toBe("solo portrait");
        expect(payload.webhook).toBe("http://localhost/api/v1/webhooks/runpod/generator");
        return { id: "runpod-prompt-1" };
      },
    }),
  }),
}));

const generatorRouter = (await import("@/routers/v1/generatorRouter")).default;
const webhookRouter = (await import("@/routers/v1/webhookRouter")).default;

function createApp() {
  return new Hono<ContextForHono>()
    .use("*", async (c, next) => {
      c.set("db", db as any);
      await next();
    })
    .route("/generator", generatorRouter)
    .route("/webhooks", webhookRouter);
}

describe("Worker generator prompt workflow", () => {
  it("starts and tracks account-scoped prompt generation through the RunPod webhook", async () => {
    const app = createApp();
    const startResponse = await app.fetch(
      new Request("http://localhost/generator/generate-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": "user-a",
        },
        body: JSON.stringify({ prompt: "solo portrait" }),
      }),
      {
        RUNPOD_API_KEY: "test-runpod-key",
        RUNPOD_GENERATOR_ID: "test-generator",
        RUNPOD_WEBHOOK_URL: "http://localhost/api/v1/webhooks/runpod",
      } as any,
    );
    const startBody = await startResponse.json();

    expect(startResponse.status).toBe(202);
    expect(startBody.message).toBe("Prompt generation job initiated.");
    expect(startBody.runpod_job_id).toBe("runpod-prompt-1");

    const runningStatusResponse = await app.fetch(
      new Request(`http://localhost/generator/prompt-status/${startBody.db_job_id}`, {
        headers: { "x-test-user-id": "user-a" },
      }),
    );
    const runningStatus = await runningStatusResponse.json();
    expect(runningStatusResponse.status).toBe(200);
    expect(runningStatus.job.status).toBe("RUNNING");

    const webhookResponse = await app.fetch(
      new Request("http://localhost/webhooks/runpod/generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "runpod-prompt-1",
          status: "COMPLETED",
          input: { job_type: "generate_prompt" },
          output: { generated_prompt: "solo portrait, safe-for-work, studio lighting" },
        }),
      }),
    );
    expect(webhookResponse.status).toBe(200);

    const completedStatusResponse = await app.fetch(
      new Request(`http://localhost/generator/prompt-status/${startBody.db_job_id}`, {
        headers: { "x-test-user-id": "user-a" },
      }),
    );
    const completedStatus = await completedStatusResponse.json();
    expect(completedStatusResponse.status).toBe(200);
    expect(completedStatus.job.status).toBe("COMPLETED");
    expect(completedStatus.job.outputPayload.generated_prompt).toBe(
      "solo portrait, safe-for-work, studio lighting",
    );
  });
});
