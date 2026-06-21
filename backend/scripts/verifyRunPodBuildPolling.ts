import {
  buildMatchesInstall,
  buildMatchesModel,
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
  buildMatchesModel({ imageName: "registry.runpod.io/example:model-build-123" }, "build-123"),
  "Build matcher should match model release tags inside imageName.",
);
assert(
  buildMatchesModel({ id: "model-build-456" }, "build-456"),
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
  !buildMatchesModel({ imageName: "registry.runpod.io/example:other" }, "build-123"),
  "Build matcher should ignore unrelated builds.",
);

const skipped = await pollRunPodModelImageBuilds(null as any, {
  RUNPOD_API_KEY: "",
  RUNPOD_GENERATOR_ID: "endpoint-id",
  MODEL_IMAGE_RUNPOD_BUILD_POLLING: "true",
});

assert(skipped.skipped === true, "Polling should skip when RUNPOD_API_KEY is missing.");

console.log("Worker RunPod build polling verification passed.");
