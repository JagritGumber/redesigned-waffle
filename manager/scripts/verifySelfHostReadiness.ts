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
    HOST_URL: "",
    FRONTEND_URL: "",
    RUNPOD_API_KEY: "",
    RUNPOD_GENERATOR_ID: "",
    RUNPOD_WEBHOOK_URL: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_PUBLIC_BUCKET_URL: "",
    R2_BUCKET_NAME: "",
    MODEL_IMAGE_WEBHOOK_TOKEN: "",
    MODEL_IMAGE_REBUILD_PROVIDER: "mirror",
    MODEL_IMAGE_REBUILD_MIRROR_TOKEN: "",
  },
  encoding: "utf-8",
});

assert(missing.status !== 0, "Readiness check should fail when required values are missing.");
const missingOutput = `${missing.stdout ?? ""}\n${missing.stderr ?? ""}`;
assert(
  missingOutput.includes("Readiness failed"),
  "Readiness check should explain missing required settings.",
);

const secretValue = "super-secret-value-that-must-not-print";
const passed = spawnSync(bunExecutable, [script], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST_URL: "https://manager.example.com",
    FRONTEND_URL: "https://studio.example.com",
    RUNPOD_API_KEY: secretValue,
    RUNPOD_GENERATOR_ID: "endpoint-id",
    RUNPOD_WEBHOOK_URL: "https://manager.example.com/api/v1/webhooks/runpod",
    R2_ACCESS_KEY_ID: "access-key",
    R2_SECRET_ACCESS_KEY: secretValue,
    R2_PUBLIC_BUCKET_URL: "https://r2.example.com",
    R2_BUCKET_NAME: "bucket",
    MODEL_IMAGE_WEBHOOK_TOKEN: secretValue,
    MODEL_IMAGE_REBUILD_PROVIDER: "mirror",
    MODEL_IMAGE_REBUILD_MIRROR_TOKEN: secretValue,
    MODEL_IMAGE_RUNPOD_BUILD_POLLING: "true",
  },
  encoding: "utf-8",
});

assert(passed.status === 0, "Readiness check should pass when required values are present.");
const passedOutput = `${passed.stdout ?? ""}\n${passed.stderr ?? ""}`;
assert(passedOutput.includes("Readiness passed."), "Readiness check should report success.");
assert(
  !passedOutput.includes(secretValue),
  "Readiness check must not print secret values.",
);

console.log("Self-host readiness verification passed.");
