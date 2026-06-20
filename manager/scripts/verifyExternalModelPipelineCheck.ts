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
  "External checker should make GitHub dispatch an explicit dry-run action.",
);
assert(
  checker.includes("Values are not printed"),
  "External checker should make it clear that secret values are redacted.",
);
assert(
  checker.includes("https://api.github.com/repos") &&
    checker.includes("/actions/workflows/model-image-rebuild.yml") &&
    checker.includes("/dispatches"),
  "External checker should validate the GitHub workflow and optional dispatch path.",
);
assert(
  checker.includes("https://api.runpod.io/graphql") &&
    checker.includes("RUNPOD_GENERATOR_ID"),
  "External checker should validate RunPod GraphQL endpoint visibility.",
);
assert(
  workflow.includes("dryRun") &&
    workflow.includes("Validate dry-run payload") &&
    workflow.includes("env.DRY_RUN != 'true'"),
  "Model image rebuild workflow should support payload validation without release/build side effects.",
);
assert(
  workflow.includes("Skipping migration commit, release, RunPod hook, and manager callback"),
  "Workflow dry-run mode should document skipped side effects.",
);

console.log("External model pipeline checker verification passed.");
