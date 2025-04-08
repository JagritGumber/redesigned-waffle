import { Hono } from "hono";
import { ContextForHono } from "@/types/context";
import groupRouter from "./v1/groupRouter";

const v1Router = new Hono<ContextForHono>().get("/hi", (c) => {
  return c.text("Hello!")
})
  .route("/group", groupRouter)

export default v1Router;
