import { triggerModelImageBuild } from "../src/services/modelImageBuildService";
import { buildMatchesInstall } from "../src/services/runpodBuildStatusService";
import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const originalFetch = globalThis.fetch;

let dispatchedUrl = "";
let dispatchedHeaders: HeadersInit | undefined;
let dispatchedBody: any;

globalThis.fetch = (async (url, init) => {
  dispatchedUrl = url.toString();
  dispatchedHeaders = init?.headers;
  dispatchedBody = JSON.parse(String(init?.body));
  return new Response(null, { status: 204 });
}) as typeof fetch;

try {
  const modelRouter = readFileSync("src/routers/v1/modelRouter.ts", "utf-8");
  const civitaiService = readFileSync("src/services/civitaiService.ts", "utf-8");
  assert(
    civitaiService.includes("findReusableActiveModelImageInstall") &&
      civitaiService.includes("IN ('BUILD_QUEUED', 'BUILDING')") &&
      civitaiService.includes("Existing Docker image build reused"),
    "Worker model installs should reuse active Docker image builds instead of dispatching duplicates.",
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

  const result = await triggerModelImageBuild(
    {
      MODEL_IMAGE_REBUILD_PROVIDER: "github",
      MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY: "owner/repo",
      MODEL_IMAGE_REBUILD_GITHUB_TOKEN: "test-token",
    },
    {
      buildTriggerId: "worker-build-123",
      civitaiModelId: 42,
      civitaiFileId: 777,
      downloadUrl: "https://civitai.com/api/download/models/777",
      runpodPath: "/runpod-volume/workspace/models/safe-model.safetensors",
      modelType: "Checkpoint" as any,
    },
  );

  assert(result.provider === "github", "Worker model image build should use GitHub provider.");
  assert(result.triggerId === "worker-build-123", "Worker build trigger ID should be stable.");
  assert(
    dispatchedUrl === "https://api.github.com/repos/owner/repo/dispatches",
    "Worker model image build should dispatch to the configured GitHub repository.",
  );

  const headers = new Headers(dispatchedHeaders);
  assert(
    headers.get("Authorization") === "Bearer test-token",
    "Worker GitHub dispatch should use the configured token.",
  );
  assert(
    dispatchedBody.event_type === "model-image-rebuild",
    "Worker GitHub dispatch should use the model-image-rebuild event type.",
  );

  const payload = dispatchedBody.client_payload;
  assert(payload.event === "model.downloaded", "Worker dispatch payload should identify model download.");
  assert(payload.buildTriggerId === "worker-build-123", "Worker dispatch payload should include buildTriggerId.");
  assert(payload.civitaiModelId === 42, "Worker dispatch payload should include Civitai model ID.");
  assert(payload.civitaiFileId === 777, "Worker dispatch payload should include Civitai file ID.");
  assert(payload.cacheKey === "civitai-42-777", "Worker dispatch payload should use manager-compatible cache key.");
  assert(payload.migration.id === "civitai-42-777", "Worker migration ID should match the cache key.");
  assert(
    payload.migration.path === "/runpod-volume/workspace/models/safe-model.safetensors",
    "Worker migration path should be the RunPod model path.",
  );

  assert(
    buildMatchesInstall(
      { commitMessage: "Add model migration civitai-42-777" },
      { buildTriggerId: "worker-build-123", civitaiModelId: 42, civitaiFileId: 777 },
    ),
    "Worker RunPod polling should match the migration commit message as a fallback.",
  );

  console.log("Worker model image pipeline contract verification passed.");
} finally {
  globalThis.fetch = originalFetch;
}
