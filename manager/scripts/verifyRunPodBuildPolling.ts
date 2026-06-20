import {
  buildMatchesInstall,
  pollRunPodModelImageBuilds,
  RUNPOD_BUILDS_QUERY,
} from "../src/services/runpodBuildStatusService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  RUNPOD_BUILDS_QUERY.includes("endpoints") &&
    RUNPOD_BUILDS_QUERY.includes("builds") &&
    RUNPOD_BUILDS_QUERY.includes("state") &&
    RUNPOD_BUILDS_QUERY.includes("imageName") &&
    RUNPOD_BUILDS_QUERY.includes("commitMessage"),
  "RunPod build polling query should request endpoint build state, image, and commit fields.",
);

assert(
  buildMatchesInstall(
    { imageName: "registry.runpod.io/example:model-build-123" },
    { buildTriggerId: "build-123" },
  ),
  "Build matcher should match model release tags inside imageName.",
);
assert(
  buildMatchesInstall({ id: "model-build-456" }, { buildTriggerId: "build-456" }),
  "Build matcher should match model release tags inside build id.",
);
assert(
  buildMatchesInstall(
    { commitMessage: "Add model migration civitai-42-777" },
    { buildTriggerId: "build-789", civitaiModelId: 42, civitaiFileId: 777 },
  ),
  "Build matcher should match the migration commit message when imageName lacks the release tag.",
);
assert(
  !buildMatchesInstall(
    { imageName: "registry.runpod.io/example:other", commitMessage: "Unrelated commit" },
    { buildTriggerId: "build-123", civitaiModelId: 42, civitaiFileId: 777 },
  ),
  "Build matcher should ignore unrelated builds.",
);

const originalApiKey = Bun.env.RUNPOD_API_KEY;
const originalPolling = Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING;
Bun.env.RUNPOD_API_KEY = "";
Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING = "true";

const skipped = await pollRunPodModelImageBuilds();
assert(skipped.skipped === true, "Polling should skip when RUNPOD_API_KEY is missing.");

if (originalApiKey === undefined) {
  delete Bun.env.RUNPOD_API_KEY;
} else {
  Bun.env.RUNPOD_API_KEY = originalApiKey;
}

if (originalPolling === undefined) {
  delete Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING;
} else {
  Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING = originalPolling;
}

console.log("RunPod build polling verification passed.");
