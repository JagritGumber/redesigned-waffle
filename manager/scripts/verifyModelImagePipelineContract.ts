import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { triggerModelImageBuild } from "../src/services/modelImageBuildService";
import { resolveModelImageWebhookState } from "../src/services/modelImageStatusService";
import { buildMatchesInstall } from "../src/services/runpodBuildStatusService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const originalFetch = globalThis.fetch;
const originalProvider = Bun.env.MODEL_IMAGE_REBUILD_PROVIDER;
const originalRepository = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
const originalToken = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN;

let dispatchedUrl = "";
let dispatchedHeaders: HeadersInit | undefined;
let dispatchedBody: any;

globalThis.fetch = (async (url, init) => {
  dispatchedUrl = url.toString();
  dispatchedHeaders = init?.headers;
  dispatchedBody = JSON.parse(String(init?.body));
  return new Response(null, { status: 204 });
}) as typeof fetch;

Bun.env.MODEL_IMAGE_REBUILD_PROVIDER = "github";
Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY = "owner/repo";
Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN = "test-token";

try {
  const result = await triggerModelImageBuild({
    civitaiModelId: 42,
    civitaiFileId: 777,
    downloadUrl: "https://civitai.com/api/download/models/777",
    runpodPath: "/runpod-volume/workspace/models/safe-model.safetensors",
    runpodJobId: "download-job-1",
  });

  assert(result.triggered, "Model image build should be triggered.");
  assert(Boolean(result.buildTriggerId), "Build trigger ID should be returned.");
  assert(
    dispatchedUrl === "https://api.github.com/repos/owner/repo/dispatches",
    "Model image build should dispatch to the configured GitHub repository.",
  );

  const headers = new Headers(dispatchedHeaders);
  assert(
    headers.get("Authorization") === "Bearer test-token",
    "GitHub dispatch should use the configured token.",
  );
  assert(
    dispatchedBody.event_type === "model-image-rebuild",
    "GitHub dispatch should use the model-image-rebuild event type.",
  );

  const payload = dispatchedBody.client_payload;
  assert(payload.event === "model.downloaded", "Dispatch payload should identify model download.");
  assert(payload.buildTriggerId === result.buildTriggerId, "Dispatch payload should include the build trigger ID.");
  assert(payload.civitaiModelId === 42, "Dispatch payload should include the Civitai model ID.");
  assert(payload.civitaiFileId === 777, "Dispatch payload should include the Civitai file ID.");
  assert(payload.runpodJobId === "download-job-1", "Dispatch payload should keep the source RunPod job ID.");
  assert(payload.cacheKey === "civitai-42-777", "Dispatch payload should include a stable cache key.");
  assert(payload.migration.id === "civitai-42-777", "Migration ID should match the cache key.");
  assert(
    payload.migration.path === "/runpod-volume/workspace/models/safe-model.safetensors",
    "Migration path should be the RunPod model path.",
  );

  assert(
    buildMatchesInstall(
      { imageName: `registry.runpod.io/selfhost:model-${result.buildTriggerId}` },
      { buildTriggerId: result.buildTriggerId! },
    ),
    "RunPod build polling should match the release tag created from the build trigger ID.",
  );
  assert(
    buildMatchesInstall(
      { commitMessage: "Add model migration civitai-42-777" },
      { buildTriggerId: result.buildTriggerId!, civitaiModelId: 42, civitaiFileId: 777 },
    ),
    "RunPod build polling should match the migration commit message as a fallback.",
  );

  const pending = resolveModelImageWebhookState({ status: "PENDING" });
  assert(pending.installStatus === "BUILDING", "RunPod PENDING should stay active in the app.");

  const completedAt = new Date("2026-06-20T00:00:00.000Z");
  const completed = resolveModelImageWebhookState({
    status: "COMPLETED",
    image: `registry.runpod.io/selfhost:model-${result.buildTriggerId}`,
    now: completedAt,
  });
  assert(completed.installStatus === "READY", "RunPod COMPLETED should mark the install ready.");
  assert(completed.deployedAt === completedAt, "RunPod COMPLETED should set deployedAt.");

  const failed = resolveModelImageWebhookState({ status: "TEST_FAILED" });
  assert(failed.installStatus === "BUILD_FAILED", "RunPod TEST_FAILED should mark the install failed.");

  const activePollingSource = readFileSync(
    resolve(import.meta.dir, "../../solid/src/hooks/useDownloadedModels.ts"),
    "utf-8",
  );
  const statusComponentSource = readFileSync(
    resolve(import.meta.dir, "../../solid/src/components/model-install-status.tsx"),
    "utf-8",
  );
  assert(
    activePollingSource.includes("isActiveModelInstall"),
    "Solid downloaded-model polling should use the shared active install helper.",
  );
  for (const status of ["REGISTERING", "DOWNLOADING", "BUILD_QUEUED", "BUILDING"]) {
    assert(
      statusComponentSource.includes(status),
      `Solid shared active install status list should include ${status}.`,
    );
  }

  assert(
    statusComponentSource.includes("showMessage"),
    "Solid status component should support visible progress messages.",
  );

  console.log("Model image pipeline contract verification passed.");
} finally {
  globalThis.fetch = originalFetch;

  if (originalProvider === undefined) delete Bun.env.MODEL_IMAGE_REBUILD_PROVIDER;
  else Bun.env.MODEL_IMAGE_REBUILD_PROVIDER = originalProvider;

  if (originalRepository === undefined) delete Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
  else Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY = originalRepository;

  if (originalToken === undefined) delete Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN;
  else Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN = originalToken;
}
