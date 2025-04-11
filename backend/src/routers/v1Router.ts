import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import groupRouter from "./v1/groupRouter";
import modelRouter from "./v1/modelRouter";

const v1Router = new Hono<ContextForHono>()
  .get("/hi", (c) => {
    return c.text("Hello!");
  })
  .route("/group", groupRouter)
  .route("/model", modelRouter);

export default v1Router;
