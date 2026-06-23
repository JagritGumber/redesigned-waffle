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
const originalMirrorToken = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_TOKEN;
const originalPublicRepositoryUrl = Bun.env.PUBLIC_REPOSITORY_URL;

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
  const civitaiService = readFileSync("src/services/civitaiService.ts", "utf-8");
  const modelRouter = readFileSync("src/routers/v1/modelRouter.ts", "utf-8");
  const buildService = readFileSync("src/services/modelImageBuildService.ts", "utf-8");
  assert(
    buildService.includes('MODEL_IMAGE_REBUILD_PROVIDER === "mirror"') &&
      buildService.includes("MODEL_IMAGE_REBUILD_MIRROR_TOKEN") &&
      buildService.includes("model-migration.yml/dispatches") &&
      buildService.includes("-deploy"),
    "Manager mirror provider should dispatch the private deploy mirror workflow.",
  );
  assert(
    !buildService.includes("MODEL_IMAGE_REBUILD_GITHUB") &&
      !buildService.includes("repository_dispatch") &&
      !buildService.includes("/releases"),
    "Manager model image provider should not contain the removed GitHub release provider path.",
  );
  assert(
    civitaiService.includes("findReusableActiveModelImageInstall") &&
      civitaiService.includes("IN ('BUILD_QUEUED', 'BUILDING')") &&
      civitaiService.includes("Existing Docker image build reused"),
    "Manager model installs should reuse active Docker image builds instead of dispatching duplicates.",
  );
  assert(
    civitaiService.includes("markAccountInstallFailed") &&
      civitaiService.includes("accountInstallResultFields") &&
      civitaiService.includes("DOWNLOAD_FAILED"),
    "Manager Civitai service should return failed install snapshots for early install failures.",
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
      modelRouter.includes(`${field}: install?.`) || modelRouter.includes(`${field}: result.${field}`),
      `Manager model install response should expose ${field}.`,
    );
  }

  Bun.env.MODEL_IMAGE_REBUILD_PROVIDER = "mirror";
  Bun.env.MODEL_IMAGE_REBUILD_MIRROR_TOKEN = "mirror-token";
  Bun.env.PUBLIC_REPOSITORY_URL = "https://github.com/JagritGumber/redesigned-waffle";

  dispatchedUrl = "";
  dispatchedHeaders = undefined;
  dispatchedBody = undefined;
  const result = await triggerModelImageBuild({
    civitaiModelId: 43,
    civitaiFileId: 778,
    downloadUrl: "https://civitai.com/api/download/models/778",
    runpodPath: "/runpod-volume/workspace/models/private-model.safetensors",
    runpodJobId: "download-job-2",
  });
  assert(result.triggered, "Private mirror provider should trigger a model image build.");
  assert(
    dispatchedUrl ===
      "https://api.github.com/repos/JagritGumber/redesigned-waffle-deploy/actions/workflows/model-migration.yml/dispatches",
    "Private mirror provider should dispatch the fixed workflow in the derived -deploy repo.",
  );
  const headers = new Headers(dispatchedHeaders);
  assert(headers.get("Authorization") === "Bearer mirror-token", "Private mirror dispatch should use the mirror token.");
  assert(dispatchedBody.ref === "main", "Private mirror workflow dispatch should target main.");
  assert(
    dispatchedBody.inputs.migrationId === "civitai-43-778" &&
      dispatchedBody.inputs.migrationUrl === "https://civitai.com/api/download/models/778" &&
      dispatchedBody.inputs.migrationPath === "/runpod-volume/workspace/models/private-model.safetensors" &&
      dispatchedBody.inputs.buildTriggerId === result.buildTriggerId,
    "Private mirror workflow dispatch should include the migration payload.",
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

  if (originalMirrorToken === undefined) delete Bun.env.MODEL_IMAGE_REBUILD_MIRROR_TOKEN;
  else Bun.env.MODEL_IMAGE_REBUILD_MIRROR_TOKEN = originalMirrorToken;

  if (originalPublicRepositoryUrl === undefined) delete Bun.env.PUBLIC_REPOSITORY_URL;
  else Bun.env.PUBLIC_REPOSITORY_URL = originalPublicRepositoryUrl;
}
