import { Hono } from "hono";
import v1Router from "./routers/v1Router";
import { ContextForHono } from "./types/context";
import { drizzle } from "drizzle-orm/d1";
import { cors } from "hono/cors";

const app = new Hono<ContextForHono>()
  .use(
    cors({
      origin: "http://localhost:5173",
    })
  )
  .use("*", (c, next) => {
    const db = drizzle(c.env.DB);
    c.set("db", db);
    return next();
  })
  .route("/api/v1", v1Router);

export default {
  port: 8080,
  fetch: app.fetch,
};
