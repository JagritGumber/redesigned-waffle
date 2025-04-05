import { Hono } from "hono";
import v1Router from "./routers/v1Router";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { ContextForHono } from "./types/context";

const app = new Hono<ContextForHono>()
  .use("*", (c, next) => {
    const sqlite = new Database("sqlite.db");
    const db = drizzle({ client: sqlite });
    c.set("db", db);
    return next();
  })
  .route("/api/v1", v1Router);

export default {
  port: 8080,
  fetch: app.fetch,
};
