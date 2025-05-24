import { Elysia } from "elysia";
import rootCron from "./crons/root";

const app = new Elysia()
  // .use(rootCron)
  .get("/", () => "Hello Elysia")
  .listen(8765);

console.log(Bun.env.NODE_ENV);

export default app;
