import { buildMatchesInstall } from "../src/services/runpodBuildStatusService";
import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

  const modelRouter = readFileSync("src/routers/v1/modelRouter.ts", "utf-8");
  const civitaiService = readFileSync("src/services/civitaiService.ts", "utf-8");
  const webhookRouter = readFileSync("src/routers/v1/webhookRouter.ts", "utf-8");
  const buildService = readFileSync("src/services/modelImageBuildService.ts", "utf-8");
  assert(
    !buildService.includes("api.github.com") &&
      !buildService.includes("MODEL_IMAGE_REBUILD_GITHUB") &&
      !buildService.includes('event_type: "model-image-rebuild"'),
    "Worker model image build service should not contain GitHub release/dispatch provider code.",
  );
  assert(
    civitaiService.includes("findReusableActiveModelImageInstall") &&
      civitaiService.includes("IN ('BUILD_QUEUED', 'BUILDING')") &&
      civitaiService.includes("Existing Docker image build reused"),
    "Worker model installs should reuse active Docker image builds instead of dispatching duplicates.",
  );
  assert(
    webhookRouter.includes("triggerModelImageBuild") &&
      webhookRouter.includes("Model image rebuild queued") &&
      webhookRouter.includes("downloadCompletedAt") &&
      webhookRouter.includes("buildTriggeredAt"),
    "Worker downloader webhook should queue a model-image rebuild after a completed legacy download.",
  );

  for (const field of [
    "installStatus",
    "statusMessage",
    "buildTriggerId",
    "civitaiFileId",
    "imageName",
    "runpodPath",
    "downloadCompletedAt",
    "buildTriggeredAt",
    "deployedAt",
  ]) {
    assert(
      modelRouter.includes(`${field}: result.${field}`),
      `Worker model install response should expose ${field}.`,
    );
    assert(
      civitaiService.includes(`${field}: accountInstall?.${field}`) ||
        (field === "installStatus" && civitaiService.includes("installStatus: accountInstall?.status")),
      `Worker Civitai service should return account install ${field}.`,
    );
  }

  assert(
    buildService.includes("No Worker-compatible model image rebuild provider is available"),
    "Worker should explicitly route private mirror model installs through manager.",
  );

  assert(
    buildMatchesInstall(
      { commitMessage: "Add model migration civitai-43-778" },
      { buildTriggerId: "worker-build-456", civitaiModelId: 43, civitaiFileId: 778 },
    ),
    "Worker RunPod polling should match the migration commit message as a fallback.",
  );

  console.log("Worker model image pipeline contract verification passed.");
