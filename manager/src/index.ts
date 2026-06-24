import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import r2CleanupCron from "./crons/r2CleanupCron";
import rootCron from "./crons/root";
import runpodBuildStatusCron from "./crons/runpodBuildStatusCron";
import { dataRouter } from "./routers/dataRouter";
import { cors } from "@elysiajs/cors";
import { v1Router } from "./routers/v1Router";

const frontendOrigins = Array.from(
  new Set([
    Bun.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
  ].filter(Boolean) as string[]),
);

const app = new Elysia({ prefix: "/api" })
  .use(rootCron)
  .use(r2CleanupCron)
  .use(runpodBuildStatusCron)
  .use(
    cors({
      origin: frontendOrigins,
      credentials: true,
    })
  )
  .use(
    rateLimit({
      max: 100,
      duration: 60_000,
      errorResponse: "Too many requests. Please try again later.",
    }),
  )
  .get("/", () => "Hello Elysia")
  .use(v1Router)
  .use(dataRouter)
  .listen(Number(Bun.env.PORT ?? 8765));

console.log(`Started development server: http://${app.server?.hostname}:${app.server?.port}`);
