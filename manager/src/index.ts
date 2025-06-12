import { Elysia } from "elysia";
import rootCron from "./crons/root";
import { dataRouter } from "./routers/dataRouter";

const app = new Elysia()
  // .use(rootCron)
  .get("/", () => "Hello Elysia")
  .use(dataRouter)
  .listen(8765);

console.log(`Started development server: http://${app.server?.hostname}:${app.server?.port}`);
