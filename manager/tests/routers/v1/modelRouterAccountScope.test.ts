import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { and, eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import * as schema from "@/schema";
import { ModelTypes } from "@/types/models";

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
    creatorId INTEGER NOT NULL REFERENCES civitaiCreator(id),
    createdAt INTEGER,
    updatedAt INTEGER,
    defaultWeight REAL DEFAULT 0.6,
    status TEXT,
    runpodJobId TEXT
  )
`);

db.run(sql`
  CREATE TABLE civitaiModelInstall (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    civitaiModelId INTEGER NOT NULL REFERENCES civitaiModel(id) ON DELETE CASCADE,
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
  CREATE UNIQUE INDEX civitaiModelInstall_user_model_unique
  ON civitaiModelInstall(userId, civitaiModelId)
`);

mock.module("@/db", () => ({ default: db }));
mock.module("@/services/civitaiService", () => ({
  registerOrUpdateCivitaiModel: async () => {
    throw new Error("registerOrUpdateCivitaiModel should not be called in this test.");
  },
}));
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

const { modelRouter } = await import("@/routers/v1/modelRouter");

function createApp() {
  return new Elysia().use(modelRouter);
}

async function seedModelInstalls() {
  await db.insert(schema.civitaiCreator).values({
    id: 1,
    username: "creator",
  });

  await db.insert(schema.civitaiModels).values({
    id: 101,
    name: "Shared Safe Model",
    description: "Shared metadata row",
    type: ModelTypes.Checkpoint,
    nsfw: false,
    tags: ["safe"],
    creatorId: 1,
  });

  await db.insert(schema.civitaiModelInstalls).values([
    {
      id: "install-a",
      userId: "user-a",
      civitaiModelId: 101,
      status: "BUILDING",
      statusMessage: "RunPod image build is still running.",
      buildTriggerId: "build-a",
      imageName: "registry.runpod.io/example:model-build-a",
      defaultWeight: 0.35,
    },
    {
      id: "install-b",
      userId: "user-b",
      civitaiModelId: 101,
      status: "READY",
      statusMessage: "Ready for generation.",
      buildTriggerId: "build-b",
      imageName: "registry.runpod.io/example:model-build-b",
      defaultWeight: 0.75,
    },
  ]);
}

describe("model router account-scoped install state", () => {
  beforeAll(async () => {
    await seedModelInstalls();
  });

  it("returns install status for only the authenticated account", async () => {
    const app = createApp();

    const userAResponse = await app.handle(
      new Request("http://localhost/model/101", {
        headers: { "x-test-user-id": "user-a" },
      }),
    );
    const userA = await userAResponse.json();

    expect(userAResponse.status).toBe(200);
    expect(userA.model.id).toBe(101);
    expect(userA.model.status).toBe("BUILDING");
    expect(userA.model.statusMessage).toBe("RunPod image build is still running.");
    expect(userA.model.buildTriggerId).toBe("build-a");
    expect(userA.model.imageName).toBe("registry.runpod.io/example:model-build-a");
    expect(userA.model.defaultWeight).toBe(0.35);

    const userBResponse = await app.handle(
      new Request("http://localhost/model/101", {
        headers: { "x-test-user-id": "user-b" },
      }),
    );
    const userB = await userBResponse.json();

    expect(userBResponse.status).toBe(200);
    expect(userB.model.status).toBe("READY");
    expect(userB.model.statusMessage).toBe("Ready for generation.");
    expect(userB.model.buildTriggerId).toBe("build-b");
    expect(userB.model.imageName).toBe("registry.runpod.io/example:model-build-b");
    expect(userB.model.defaultWeight).toBe(0.75);
  });

  it("updates and deletes only the authenticated account install", async () => {
    const app = createApp();

    const patchResponse = await app.handle(
      new Request("http://localhost/model/101", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": "user-a",
        },
        body: JSON.stringify({ defaultWeight: 0.5 }),
      }),
    );
    expect(patchResponse.status).toBe(200);

    const [userAAfterPatch] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(
        and(
          eq(schema.civitaiModelInstalls.userId, "user-a"),
          eq(schema.civitaiModelInstalls.civitaiModelId, 101),
        ),
      );
    const [userBAfterPatch] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(
        and(
          eq(schema.civitaiModelInstalls.userId, "user-b"),
          eq(schema.civitaiModelInstalls.civitaiModelId, 101),
        ),
      );

    expect(userAAfterPatch.defaultWeight).toBe(0.5);
    expect(userBAfterPatch.defaultWeight).toBe(0.75);

    const deleteResponse = await app.handle(
      new Request("http://localhost/model/101", {
        method: "DELETE",
        headers: { "x-test-user-id": "user-a" },
      }),
    );
    expect(deleteResponse.status).toBe(200);

    const remainingModelRows = await db.select().from(schema.civitaiModels);
    const remainingInstalls = await db.select().from(schema.civitaiModelInstalls);

    expect(remainingModelRows).toHaveLength(1);
    expect(remainingInstalls).toHaveLength(1);
    expect(remainingInstalls[0].userId).toBe("user-b");
  });
});
