import { resolveModelImageWebhookState } from "../src/services/modelImageStatusService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const fixedNow = new Date("2026-06-20T00:00:00.000Z");

const deployed = resolveModelImageWebhookState({
  status: "DEPLOYED",
  now: fixedNow,
});
assert(deployed.modelStatus === "DOWNLOADED", "DEPLOYED should mark the model DOWNLOADED.");
assert(deployed.deployedAt === fixedNow, "DEPLOYED should set deployedAt.");

const completed = resolveModelImageWebhookState({
  status: "completed",
  now: fixedNow,
});
assert(completed.modelStatus === "DOWNLOADED", "COMPLETED should mark the model DOWNLOADED.");
assert(completed.deployedAt === fixedNow, "COMPLETED should set deployedAt.");

const failed = resolveModelImageWebhookState({
  status: "ERROR",
  now: fixedNow,
});
assert(failed.modelStatus === "BUILD_FAILED", "ERROR should mark the model BUILD_FAILED.");
assert(failed.deployedAt === null, "ERROR should not set deployedAt.");

for (const status of ["FAILED", "CANCELLED", "TEST_FAILED"]) {
  const state = resolveModelImageWebhookState({ status, now: fixedNow });
  assert(state.modelStatus === "BUILD_FAILED", `${status} should mark the model BUILD_FAILED.`);
  assert(state.deployedAt === null, `${status} should not set deployedAt.`);
}

const building = resolveModelImageWebhookState({
  status: "IN_PROGRESS",
  now: fixedNow,
});
assert(building.modelStatus === "BUILDING", "Unknown active statuses should mark BUILDING.");

for (const status of ["PENDING", "BUILDING", "UPLOADING", "TESTING"]) {
  const state = resolveModelImageWebhookState({ status, now: fixedNow });
  assert(state.modelStatus === "BUILDING", `${status} should keep the model BUILDING.`);
  assert(state.deployedAt === null, `${status} should not set deployedAt.`);
}

console.log("Worker model image status verification passed.");
