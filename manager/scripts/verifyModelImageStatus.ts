import { resolveModelImageWebhookState } from "../src/services/modelImageStatusService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const fixedNow = new Date("2026-06-20T00:00:00.000Z");

const deployed = resolveModelImageWebhookState({
  status: "DEPLOYED",
  image: "repo/generator:model-123",
  now: fixedNow,
});
assert(deployed.installStatus === "READY", "DEPLOYED should mark the install READY.");
assert(deployed.deployedAt === fixedNow, "DEPLOYED should set deployedAt.");
assert(
  deployed.statusMessage.includes("repo/generator:model-123"),
  "DEPLOYED fallback message should include the image name.",
);

const completed = resolveModelImageWebhookState({
  status: "completed",
  message: "Custom success",
  now: fixedNow,
});
assert(completed.installStatus === "READY", "COMPLETED should mark the install READY.");
assert(completed.statusMessage === "Custom success", "Explicit messages should be preserved.");
assert(completed.deployedAt === fixedNow, "COMPLETED should set deployedAt.");

const failed = resolveModelImageWebhookState({
  status: "FAILED",
  now: fixedNow,
});
assert(failed.installStatus === "BUILD_FAILED", "FAILED should mark the install BUILD_FAILED.");
assert(failed.deployedAt === null, "FAILED should not set deployedAt.");

for (const status of ["ERROR", "CANCELLED", "TEST_FAILED"]) {
  const state = resolveModelImageWebhookState({ status, now: fixedNow });
  assert(state.installStatus === "BUILD_FAILED", `${status} should mark the install BUILD_FAILED.`);
  assert(state.deployedAt === null, `${status} should not set deployedAt.`);
}

const building = resolveModelImageWebhookState({
  status: "IN_PROGRESS",
  now: fixedNow,
});
assert(building.installStatus === "BUILDING", "Unknown active statuses should mark BUILDING.");
assert(
  building.statusMessage === "Docker image build status: IN_PROGRESS",
  "BUILDING fallback message should include the original status.",
);

for (const status of ["PENDING", "BUILDING", "UPLOADING", "TESTING"]) {
  const state = resolveModelImageWebhookState({ status, now: fixedNow });
  assert(state.installStatus === "BUILDING", `${status} should keep the install BUILDING.`);
  assert(state.deployedAt === null, `${status} should not set deployedAt.`);
}

console.log("Model image status verification passed.");
