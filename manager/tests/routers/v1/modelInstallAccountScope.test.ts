import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/schema";
import { ModelTypes } from "@/types/models";

const client = new Database(":memory:");
const db = drizzle({ client, schema });

db.run(sql`
  CREATE TABLE user (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER,
    image TEXT,
    password TEXT
  )
`);

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
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    civitaiModelId INTEGER NOT NULL REFERENCES civitaiModel(id) ON DELETE CASCADE,
    defaultWeight REAL DEFAULT 0.6,
    status TEXT DEFAULT 'READY',
    runpodJobId TEXT,
    civitaiFileId INTEGER,
    runpodPath TEXT,
    statusMessage TEXT,
    buildTriggerId TEXT,
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

describe("account-scoped model installs", () => {
  it("allows two users to install the same global Civitai model with independent status", async () => {
    await db.insert(schema.users).values([
      { id: "user-a", email: "a@example.com" },
      { id: "user-b", email: "b@example.com" },
    ]);

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
        statusMessage: "RunPod build is still running.",
        buildTriggerId: "build-a",
        defaultWeight: 0.35,
      },
      {
        id: "install-b",
        userId: "user-b",
        civitaiModelId: 101,
        status: "READY",
        statusMessage: "Ready for generation.",
        buildTriggerId: "build-b",
        defaultWeight: 0.75,
      },
    ]);

    const [userAInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(
        and(
          eq(schema.civitaiModelInstalls.userId, "user-a"),
          eq(schema.civitaiModelInstalls.civitaiModelId, 101),
        ),
      );

    const [userBInstall] = await db
      .select()
      .from(schema.civitaiModelInstalls)
      .where(
        and(
          eq(schema.civitaiModelInstalls.userId, "user-b"),
          eq(schema.civitaiModelInstalls.civitaiModelId, 101),
        ),
      );

    expect(userAInstall.status).toBe("BUILDING");
    expect(userAInstall.buildTriggerId).toBe("build-a");
    expect(userAInstall.defaultWeight).toBe(0.35);
    expect(userBInstall.status).toBe("READY");
    expect(userBInstall.buildTriggerId).toBe("build-b");
    expect(userBInstall.defaultWeight).toBe(0.75);

    await db
      .delete(schema.civitaiModelInstalls)
      .where(eq(schema.civitaiModelInstalls.userId, "user-a"));

    const remainingModelRows = await db.select().from(schema.civitaiModels);
    const remainingInstalls = await db.select().from(schema.civitaiModelInstalls);

    expect(remainingModelRows).toHaveLength(1);
    expect(remainingInstalls).toHaveLength(1);
    expect(remainingInstalls[0].userId).toBe("user-b");
  });

  it("rejects duplicate installs for the same user and model", async () => {
    let duplicateRejected = false;

    try {
      await db.insert(schema.civitaiModelInstalls).values({
        id: "install-b-duplicate",
        userId: "user-b",
        civitaiModelId: 101,
      });
    } catch {
      duplicateRejected = true;
    }

    expect(duplicateRejected).toBe(true);
  });
});
