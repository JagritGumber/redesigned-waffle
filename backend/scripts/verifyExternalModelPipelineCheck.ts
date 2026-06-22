import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const checker = readFileSync("scripts/checkExternalModelPipeline.ts", "utf-8");
const workflow = readFileSync("../.github/workflows/model-image-rebuild.yml", "utf-8");

assert(
  checker.includes("--dispatch-dry-run") && checker.includes("dryRun: true"),
  "Worker external checker should make GitHub dispatch an explicit dry-run action.",
);
assert(
  checker.includes("--wait") &&
    checker.includes("waitForGithubDryRun") &&
    checker.includes("/actions/workflows/model-image-rebuild.yml/runs") &&
    checker.includes('conclusion === "success"'),
  "Worker external checker should optionally wait for the dry-run workflow to complete successfully.",
);
assert(
  checker.includes("--verify-release") &&
    checker.includes("checkGithubRelease") &&
    checker.includes("/releases/tags/") &&
    checker.includes("checkRunPodReleaseBuild") &&
    checker.includes("No visible RunPod build matched"),
  "Worker external checker should verify a real GitHub release and matching RunPod build by tag.",
);
assert(
  checker.includes("Values are not printed"),
  "Worker external checker should make it clear that secret values are redacted.",
);
assert(
  checker.includes("HOST_URL") &&
    checker.includes("RUNPOD_WEBHOOK_URL") &&
    checker.includes("checkWorkerHealth") &&
    checker.includes("/api/v1/health") &&
    checker.includes("Worker callback URL"),
  "Worker external checker should validate that the public Worker callback base is reachable.",
);
assert(
  checker.includes("https://api.github.com/repos") &&
    checker.includes("/actions/workflows/model-image-rebuild.yml") &&
    checker.includes("/dispatches"),
  "Worker external checker should validate the GitHub workflow and optional dispatch path.",
);
assert(
  checker.includes("https://api.runpod.io/graphql") &&
    checker.includes("RUNPOD_GENERATOR_ID"),
  "Worker external checker should validate RunPod GraphQL endpoint visibility.",
);
assert(
  workflow.includes("dryRun") &&
    workflow.includes("run-name: Model image rebuild") &&
    workflow.includes("Validate dry-run payload") &&
    workflow.includes("env.DRY_RUN != 'true'"),
  "Model image rebuild workflow should support identifiable payload validation without release/build side effects.",
);
assert(
  workflow.includes("Skipping migration commit, release, RunPod hook, and manager callback"),
  "Workflow dry-run mode should document skipped side effects.",
);

console.log("Worker external model pipeline checker verification passed.");
