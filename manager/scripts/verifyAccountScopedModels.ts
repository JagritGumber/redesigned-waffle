import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function source(path: string) {
  return readFileSync(resolve(import.meta.dir, "..", path), "utf-8");
}

const modelRouter = source("src/routers/v1/modelRouter.ts");
const generatorRouter = source("src/routers/v1/generatorRouter.ts");
const webhookRouter = source("src/routers/v1/webhookRouter.ts");
const modelInstallSchema = source("src/schema/modelInstall.ts");
const generatorJobSchema = source("src/schema/generatorJob.ts");
const authRouter = source("src/routers/v1/authRouter.ts");
const authUtils = source("src/utils/auth.ts");

for (const route of ['"/register"', '"/login"', '"/me"', '"/logout"']) {
  assert(authRouter.includes(route), `Auth router should expose ${route}.`);
}
assert(authUtils.includes("SESSION_COOKIE"), "Auth utils should use a session cookie.");
assert(authRouter.includes("httpOnly: true"), "Session cookie should be HttpOnly.");
assert(authRouter.includes('sameSite: "lax"'), "Session cookie should use SameSite=Lax.");
assert(authRouter.includes('path: "/"'), "Session cookie should be path-scoped to the app.");
assert(authUtils.includes("requireUserId"), "Auth utils should expose requireUserId.");
assert(authUtils.includes("set.status = 401"), "requireUserId should reject unauthenticated requests.");

assert(
  modelInstallSchema.includes("userId: text(\"userId\")") &&
    modelInstallSchema.includes(".references(() => users.id") &&
    modelInstallSchema.includes("onDelete: \"cascade\""),
  "Model installs should belong to a user and cascade on user deletion.",
);
assert(
  modelInstallSchema.includes("uniqueIndex(\"civitaiModelInstall_user_model_unique\")") &&
    modelInstallSchema.includes("table.userId") &&
    modelInstallSchema.includes("table.civitaiModelId"),
  "Model installs should be unique per user/model pair.",
);

const requiredModelRouterSnippets = [
  "const userId = await requireUserId",
  "getInstalledModelIds(userId)",
  "eq(civitaiModelInstalls.userId, userId)",
  "eq(civitaiModelInstalls.civitaiModelId, id)",
  "await db.delete(civitaiModelInstalls).where(eq(civitaiModelInstalls.userId, userId))",
  "Model with ID ${id} not found for this account",
  "Removed all installed models for this account.",
];

for (const snippet of requiredModelRouterSnippets) {
  assert(modelRouter.includes(snippet), `Model router is missing account-scope snippet: ${snippet}`);
}

assert(
  !modelRouter.includes("await db.update(civitaiModels).set({\n          status:") &&
    !modelRouter.includes("await db.delete(civitaiModels)"),
  "Model router should not update/delete global model rows for per-account install actions.",
);
assert(
  webhookRouter.includes("user_id: t.Optional(t.String())") &&
    webhookRouter.includes(".delete(civitaiModelInstalls)") &&
    webhookRouter.includes("eq(civitaiModelInstalls.userId, input.user_id)") &&
    webhookRouter.includes("eq(civitaiModelInstalls.userId, userId!)"),
  "Legacy downloader delete callbacks should update/delete account install rows only.",
);
assert(
  !webhookRouter.includes("await db.update(civitaiModels).set({\n                status: \"DELETED\"") &&
    !webhookRouter.includes("All models in DB marked as DELETED"),
  "Legacy downloader delete callbacks should not mark global Civitai model rows as deleted.",
);

assert(
  generatorRouter.includes("eq(civitaiModelInstalls.userId, userId)") &&
    generatorRouter.includes("inArray(civitaiModelInstalls.civitaiModelId, uniqueRequestedModelIds)") &&
    generatorRouter.includes("One or more selected models are not installed for this account."),
  "Generator route should only allow models installed by the current account.",
);
assert(
  generatorRouter.includes("userId,") &&
    generatorRouter.includes("eq(jobs.userId, userId)") &&
    generatorRouter.includes("eq(generatorJobs.userId, userId)"),
  "Generator jobs should be created and queried per account.",
);
assert(
  generatorJobSchema.includes("userId: text(\"userId\").references(() => users.id"),
  "Generator jobs should store the owning user ID.",
);

console.log("Account-scoped model contract verification passed.");
