import Elysia from "elysia";
import { generatorRouter } from "./v1/generatorRouter";
import { modelRouter } from "./v1/modelRouter";
import { imageRouter } from "./v1/imageRouter";
import { groupRouter } from "./v1/groupRouter";
import { templatesRouter } from "./v1/templatesRouter";
import { webhookRouter } from "./v1/webhookRouter";
import { authRouter } from "./v1/authRouter";

export const v1Router = new Elysia({ name: "v1.router", prefix: "/v1" })
  .get("/health", () => ({
    service: "manager",
    status: "ok",
    timestamp: new Date().toISOString(),
  }))
  .use(authRouter)
  .use(generatorRouter)
  .use(modelRouter)
  .use(imageRouter)
  .use(groupRouter)
  .use(templatesRouter)
  .use(webhookRouter);
