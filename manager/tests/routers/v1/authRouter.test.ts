import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/schema";

mock.module("elysia-rate-limit", () => ({
  rateLimit: () => (app: any) => app,
}));

const client = new Database(":memory:");
const db = drizzle({ client, schema });

db.run(sql`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER,
    image TEXT,
    password TEXT
  )
`);

db.run(sql`
  CREATE TABLE IF NOT EXISTS session (
    sessionToken TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  )
`);

mock.module("@/db", () => ({ default: db }));

const { authRouter } = await import("@/routers/v1/authRouter");
import { Elysia } from "elysia";

function createApp() {
  return new Elysia().use(authRouter);
}

describe("POST /auth/register", () => {
  it("registers a new user", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "password123",
          name: "New User",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.user.email).toBe("newuser@example.com");
    expect(body.user.name).toBe("New User");
  });

  it("rejects duplicate email", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "password123",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toBe("User already exists.");
  });

  it("rejects short password", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "another@example.com",
          password: "1234567",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /auth/login", () => {
  beforeAll(async () => {
    await db.insert(schema.users).values({
      id: crypto.randomUUID(),
      name: "Login User",
      email: "login@example.com",
      password: await Bun.password.hash("correct-password", {
        algorithm: "argon2id",
        memoryCost: 19456,
        timeCost: 2,
      }),
    });
  });

  it("logs in with correct credentials", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login@example.com",
          password: "correct-password",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.user.email).toBe("login@example.com");
    expect(res.headers.get("Set-Cookie")).toMatch(/selfhost_session=/);
  });

  it("rejects wrong password", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login@example.com",
          password: "wrong-password",
        }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe("Invalid email or password.");
  });

  it("rejects non-existent user", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "some-password",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  let sessionCookie: string;

  beforeAll(async () => {
    const [user] = await db.insert(schema.users).values({
      id: crypto.randomUUID(),
      name: "Me User",
      email: "me@example.com",
      password: await Bun.password.hash("password", {
        algorithm: "argon2id",
        memoryCost: 19456,
        timeCost: 2,
      }),
    }).returning();

    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    await db.insert(schema.sessions).values({
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + 1000 * 60 * 60),
    });

    sessionCookie = `selfhost_session=${encodeURIComponent(token)}`;
  });

  it("returns user when authenticated", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/me", {
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("me@example.com");
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/me"),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  let sessionCookie: string;
  let sessionToken: string;

  beforeAll(async () => {
    const [user] = await db.insert(schema.users).values({
      id: crypto.randomUUID(),
      name: "Logout User",
      email: "logout@example.com",
      password: await Bun.password.hash("password", {
        algorithm: "argon2id",
        memoryCost: 19456,
        timeCost: 2,
      }),
    }).returning();

    sessionToken = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    await db.insert(schema.sessions).values({
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 1000 * 60 * 60),
    });

    sessionCookie = `selfhost_session=${encodeURIComponent(sessionToken)}`;
  });

  it("destroys session and clears cookie", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { Cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/selfhost_session=;/);

    const remaining = await db.select().from(schema.sessions)
      .where(eq(schema.sessions.sessionToken, sessionToken))
      .limit(1);
    expect(remaining.length).toBe(0);
  });
});
