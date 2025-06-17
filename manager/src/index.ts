import { Elysia } from "elysia";
import r2CleanupCron from "./crons/r2CleanupCron";
import { dataRouter } from "./routers/dataRouter";
import { cors } from "@elysiajs/cors";
import { v1Router } from "./routers/v1Router";

const app = new Elysia({ prefix: "/api" })
  // .use(rootCron)
  .use(r2CleanupCron)
  .use(
    cors({
      origin: "localhost:3000",
    })
  )
  .get("/", () => "Hello Elysia")
  .use(v1Router)
  .use(dataRouter)
  .listen(8765);

console.log(`Started development server: http://${app.server?.hostname}:${app.server?.port}`);
