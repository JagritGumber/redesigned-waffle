import { resolveModelImageWebhookState } from "../src/services/modelImageStatusService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const fixedNow = new Date("2026-06-20T00:00:00.000Z");

const deployed = resolveModelImageWebhookState({
  status: "DEPLOYED",
  image: "registry.runpod.io/example:model-build",
  now: fixedNow,
});
assert(deployed.installStatus === "READY", "DEPLOYED should mark the install READY.");
assert(
  deployed.statusMessage === "Docker image registry.runpod.io/example:model-build is ready for RunPod.",
  "DEPLOYED should include a useful ready message.",
);
assert(deployed.deployedAt === fixedNow, "DEPLOYED should set deployedAt.");

const completed = resolveModelImageWebhookState({
  status: "completed",
  now: fixedNow,
});
assert(completed.installStatus === "READY", "COMPLETED should mark the install READY.");
assert(completed.deployedAt === fixedNow, "COMPLETED should set deployedAt.");

const failed = resolveModelImageWebhookState({
  status: "ERROR",
  message: "RunPod build failed.",
  now: fixedNow,
});
assert(failed.installStatus === "BUILD_FAILED", "ERROR should mark the install BUILD_FAILED.");
assert(failed.statusMessage === "RunPod build failed.", "ERROR should preserve failure message.");
assert(failed.deployedAt === null, "ERROR should not set deployedAt.");

for (const status of ["FAILED", "CANCELLED", "TEST_FAILED"]) {
  const state = resolveModelImageWebhookState({ status, now: fixedNow });
  assert(state.installStatus === "BUILD_FAILED", `${status} should mark the install BUILD_FAILED.`);
  assert(state.deployedAt === null, `${status} should not set deployedAt.`);
}

const building = resolveModelImageWebhookState({
  status: "IN_PROGRESS",
  now: fixedNow,
});
assert(building.installStatus === "BUILDING", "Unknown active statuses should mark BUILDING.");

for (const status of ["PENDING", "BUILDING", "UPLOADING", "TESTING"]) {
  const state = resolveModelImageWebhookState({ status, now: fixedNow });
  assert(state.installStatus === "BUILDING", `${status} should keep the install BUILDING.`);
  assert(state.deployedAt === null, `${status} should not set deployedAt.`);
}

console.log("Worker model image status verification passed.");
