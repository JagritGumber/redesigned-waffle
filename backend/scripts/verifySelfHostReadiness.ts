import { spawnSync } from "node:child_process";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const script = "scripts/checkSelfHostReadiness.ts";
const bunExecutable = process.execPath;

const missing = spawnSync(bunExecutable, [script], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AUTH_SECRET: "",
    RUNPOD_API_KEY: "",
    RUNPOD_GENERATOR_ID: "",
    RUNPOD_WEBHOOK_URL: "",
    R2_PUBLIC_BUCKET_URL: "",
    R2_BUCKET_NAME: "",
    MODEL_IMAGE_WEBHOOK_TOKEN: "",
    MODEL_IMAGE_REBUILD_PROVIDER: "",
    MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY: "",
    MODEL_IMAGE_REBUILD_GITHUB_TOKEN: "",
  },
  encoding: "utf-8",
});

assert(missing.status !== 0, "Worker readiness check should fail when required values are missing.");
const missingOutput = `${missing.stdout ?? ""}\n${missing.stderr ?? ""}`;
assert(
  missingOutput.includes("Readiness failed"),
  "Worker readiness check should explain missing required settings.",
);
assert(
  missingOutput.includes("wrangler DB binding") &&
    missingOutput.includes("wrangler R2 binding") &&
    missingOutput.includes("wrangler cron trigger"),
  "Worker readiness check should validate Wrangler bindings and Cron trigger.",
);

const secretValue = "super-secret-value-that-must-not-print";
const passed = spawnSync(bunExecutable, [script], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AUTH_SECRET: secretValue,
    RUNPOD_API_KEY: secretValue,
    RUNPOD_GENERATOR_ID: "endpoint-id",
    RUNPOD_WEBHOOK_URL: "https://worker.example.com/api/v1/webhooks/runpod",
    R2_PUBLIC_BUCKET_URL: "https://r2.example.com",
    R2_BUCKET_NAME: "bucket",
    MODEL_IMAGE_WEBHOOK_TOKEN: secretValue,
    MODEL_IMAGE_REBUILD_PROVIDER: "",
    MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA: "false",
    MODEL_IMAGE_RUNPOD_BUILD_POLLING: "true",
  },
  encoding: "utf-8",
});

assert(passed.status === 0, "Worker readiness check should pass when required values are present.");
const passedOutput = `${passed.stdout ?? ""}\n${passed.stderr ?? ""}`;
assert(passedOutput.includes("Readiness passed."), "Worker readiness check should report success.");
assert(
  !passedOutput.includes(secretValue),
  "Worker readiness check must not print secret values.",
);

console.log("Worker self-host readiness verification passed.");
