import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
const originalMirrorPath = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PATH;
const originalMirrorPush = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PUSH;

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
      buildService.includes("MODEL_IMAGE_REBUILD_MIRROR_PATH") &&
      buildService.includes("generator/scripts/add_model_migration.py") &&
      buildService.includes("git\", \"commit"),
    "Manager mirror provider should commit migrations into a private deploy mirror.",
  );
  assert(
    !buildService.includes("api.github.com") &&
      !buildService.includes("MODEL_IMAGE_REBUILD_GITHUB") &&
      !buildService.includes("repository dispatch"),
    "Manager model image provider should not contain a GitHub release/dispatch path.",
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

  const mirrorPath = createPrivateMirrorFixture();
  Bun.env.MODEL_IMAGE_REBUILD_PROVIDER = "mirror";
  Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PATH = mirrorPath;
  Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PUSH = "false";

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
  assert(dispatchedUrl === "", "Private mirror provider should not dispatch a webhook.");
  assert(
    readFileSync(join(mirrorPath, "generator/model-migrations/0001-civitai-43-778.json"), "utf-8").includes(
      "private-model.safetensors",
    ),
    "Private mirror provider should write the model migration into the mirror.",
  );
  assert(
    readFileSync(join(mirrorPath, "generator/Dockerfile"), "utf-8").includes("0001-civitai-43-778.json"),
    "Private mirror provider should render the mirror Dockerfile with the new migration layer.",
  );
  assert(
    run(["git", "log", "-1", "--pretty=%B"], mirrorPath).stdout.includes("Add model migration civitai-43-778"),
    "Private mirror provider should commit the migration to the mirror repo.",
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

  if (originalMirrorPath === undefined) delete Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PATH;
  else Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PATH = originalMirrorPath;

  if (originalMirrorPush === undefined) delete Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PUSH;
  else Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PUSH = originalMirrorPush;
}

function createPrivateMirrorFixture() {
  const mirrorPath = mkdtempSync(join(tmpdir(), "redesigned-waffle-mirror-"));
  cpSync(resolve(import.meta.dir, "../../generator"), join(mirrorPath, "generator"), {
    recursive: true,
    filter: (source) => !source.includes("__pycache__"),
  });
  for (const command of [
    ["git", "init"],
    ["git", "config", "user.email", "mirror@example.com"],
    ["git", "config", "user.name", "Private Mirror Test"],
    ["git", "add", "generator"],
    ["git", "commit", "-m", "Initial mirror"],
  ]) {
    run(command, mirrorPath);
  }
  return mirrorPath;
}

function run(command: string[], cwd: string) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
