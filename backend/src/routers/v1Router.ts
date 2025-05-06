import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import groupRouter from "./v1/groupRouter";
import modelRouter from "./v1/modelRouter";
import webhookRouter from "./v1/webhookRouter";
import generatorRouter from "./v1/generatorRouter";
import imageRouter from "./v1/imageRouter";
import templatesRouter from "./v1/templatesRouter";

const v1Router = new Hono<ContextForHono>()
  .get("/hi", (c) => {
    return c.text("Hello!");
  })
  .route("/webhooks", webhookRouter)
  .route("/group", groupRouter)
  .route("/model", modelRouter)
  .route("/generator", generatorRouter)
  .route("/images", imageRouter)
  .route("/post-templates", templatesRouter);

export default v1Router;
