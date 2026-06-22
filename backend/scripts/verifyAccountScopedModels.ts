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
const modelImageBuildService = source("src/services/modelImageBuildService.ts");
const authRouter = source("src/routers/v1/authRouter.ts");
const contextTypes = source("src/types/context.ts");
const authUtils = source("src/utils/auth.ts");
const modelInstallSchema = source("src/schema/modelInstall.ts");
const civitaiService = source("src/services/civitaiService.ts");
const buildPoller = source("src/services/runpodBuildStatusService.ts");
const webhookRouter = source("src/routers/v1/webhookRouter.ts");

for (const route of ['"/register"', '"*"']) {
  assert(authRouter.includes(route), `Worker auth router should expose ${route}.`);
}
assert(authRouter.includes("authHandler()"), "Worker auth router should mount Auth.js handlers.");
assert(
  authUtils.includes("getRequiredUserId") && authUtils.includes("authUser"),
  "Worker auth utils should resolve the authenticated user ID from Auth.js context.",
);
assert(
  modelRouter.includes("verifyAuth()") && generatorRouter.includes("verifyAuth()"),
  "Worker model and generator routers should require Auth.js authentication.",
);

assert(
  contextTypes.includes("MODEL_IMAGE_REBUILD_PROVIDER") &&
    contextTypes.includes("MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA") &&
    contextTypes.includes("MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY") &&
    contextTypes.includes("MODEL_IMAGE_REBUILD_GITHUB_TOKEN"),
  "Worker context should expose model image rebuild env bindings.",
);
assert(
  modelImageBuildService.includes('event_type: "model-image-rebuild"') &&
    modelImageBuildService.includes("MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA") &&
    modelImageBuildService.includes("writes model migration metadata to GitHub") &&
    modelImageBuildService.includes("MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY") &&
    modelImageBuildService.includes("MODEL_IMAGE_REBUILD_GITHUB_TOKEN"),
  "Worker model image build service should guard GitHub metadata exposure.",
);

for (const snippet of [
  "MODEL_IMAGE_REBUILD_PROVIDER: c.env.MODEL_IMAGE_REBUILD_PROVIDER",
  "MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA: c.env.MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA",
  "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY: c.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
  "MODEL_IMAGE_REBUILD_GITHUB_TOKEN: c.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
  "isModelImageRebuildConfigured(envConfig)",
  "The GitHub/custom rebuild path does not need the legacy downloader endpoint.",
]) {
  assert(modelRouter.includes(snippet), `Worker model router is missing rebuild snippet: ${snippet}`);
}

for (const snippet of [
  "const userId = getRequiredUserId(c)",
  "civitaiModelInstalls",
  "getInstalledModelIds(db, userId)",
  "applyInstallState(models, byModelId)",
  "Removed all installed models for this account.",
]) {
  assert(modelRouter.includes(snippet), `Worker model router is missing user-scope snippet: ${snippet}`);
}

for (const snippet of [
  "const userId = getRequiredUserId(c)",
  ".post(\"/generate-image\"",
  ".post(\"/generate\"",
  ".post(\"/generate-prompt\"",
  ".get(\"/prompt-status/:id\"",
  "generatorPrompts",
  "eq(prompts.userId, userId)",
  "uniqueRequestedModelIds",
  "eq(civitaiModelInstalls.userId, userId)",
  "inArray(civitaiModelInstalls.civitaiModelId, uniqueRequestedModelIds)",
  "One or more selected models are not installed for this account.",
  "userId,",
  "eq(jobs.userId, userId)",
  "eq(generatorJobs.userId, userId)",
]) {
  assert(
    generatorRouter.includes(snippet),
    `Worker generator router is missing account-scope snippet: ${snippet}`,
  );
}

assert(
  modelInstallSchema.includes("uniqueIndex(\"civitaiModelInstall_user_model_unique\")") &&
    modelInstallSchema.includes("table.userId") &&
    modelInstallSchema.includes("table.civitaiModelId"),
  "Worker model installs should be unique per user/model pair.",
);
assert(
  civitaiService.includes("civitaiModelInstalls") &&
    civitaiService.includes("target: [civitaiModelInstalls.userId, civitaiModelInstalls.civitaiModelId]") &&
    civitaiService.includes("user_id: userId") &&
    civitaiService.includes("status: \"DOWNLOADING\"") &&
    !civitaiService.includes("userId,\n      } satisfies InsertCivitaiModel"),
  "Worker Civitai service should store global model metadata and per-user install rows separately.",
);
assert(
  buildPoller.includes("from(civitaiModelInstalls)") &&
    buildPoller.includes("update(civitaiModelInstalls)"),
  "Worker RunPod build polling should update per-user install rows.",
);
assert(
  webhookRouter.includes("update(civitaiModelInstalls)") &&
    webhookRouter.includes("generatorPrompts") &&
    webhookRouter.includes("generate_prompt") &&
    webhookRouter.includes("generated_prompt") &&
    webhookRouter.includes("buildTriggerId") &&
    webhookRouter.includes("eq(civitaiModelInstalls.runpodJobId, runpodJobId)") &&
    webhookRouter.includes("eq(civitaiModelInstalls.userId, input.user_id)"),
  "Worker webhooks should update per-user install rows and prompt jobs.",
);
assert(
  webhookRouter.includes("Model install status set to DELETED") &&
    webhookRouter.includes("Model install status set to DELETE_FAILED") &&
    !webhookRouter.includes("db.query.civitaiModels.findFirst") &&
    !webhookRouter.includes("Model status set to DELETED") &&
    !webhookRouter.includes("Model status set to DELETE_FAILED"),
  "Worker single-delete webhook should update install rows without depending on global model metadata.",
);
assert(
  webhookRouter.includes("DELETE ALL webhook") &&
    webhookRouter.includes(".where(eq(civitaiModelInstalls.userId, input.user_id))") &&
    !webhookRouter.includes("await db.delete(civitaiModelInstalls);") &&
    !webhookRouter.includes("Error updating all models status to DELETED"),
  "Worker deleteAll webhook must not delete all account install rows globally.",
);

console.log("Worker account-scoped model contract verification passed.");
