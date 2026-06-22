import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const hasValue = (key: string) => Boolean(Bun.env[key]?.trim());

function required(key: string, purpose: string): Check {
  return {
    name: key,
    ok: hasValue(key),
    detail: purpose,
  };
}

function optional(key: string, purpose: string): Check {
  return {
    name: key,
    ok: true,
    detail: hasValue(key) ? `${purpose} Configured.` : `${purpose} Optional.`,
  };
}

function wranglerCheck(name: string, ok: boolean, detail: string): Check {
  return { name, ok, detail };
}

function printCheck(check: Check) {
  const marker = check.ok ? "ok" : "missing";
  console.log(`${marker.padEnd(7)} ${check.name.padEnd(40)} ${check.detail}`);
}

function readWranglerConfig() {
  try {
    return readFileSync(resolve(import.meta.dir, "..", "wrangler.jsonc"), "utf-8");
  } catch {
    return "";
  }
}

const provider = Bun.env.MODEL_IMAGE_REBUILD_PROVIDER || "";
const usesGithubProvider = provider === "github";
const pollingEnabled = Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING !== "false";
const wranglerConfig = readWranglerConfig();

const checks: Check[] = [
  required("AUTH_SECRET", "Auth.js session signing secret."),
  required("RUNPOD_API_KEY", "Required for generation and RunPod build polling."),
  required("RUNPOD_GENERATOR_ID", "RunPod Serverless generator endpoint ID."),
  required("RUNPOD_WEBHOOK_URL", "Public Worker webhook base for RunPod generation jobs."),
  required("R2_PUBLIC_BUCKET_URL", "Public object storage URL."),
  required("R2_BUCKET_NAME", "Object storage bucket name."),
  required("MODEL_IMAGE_WEBHOOK_TOKEN", "Shared token for model-image build callbacks."),
  {
    name: "MODEL_IMAGE_REBUILD_PROVIDER",
    ok: !provider || usesGithubProvider,
    detail:
      "Worker cannot commit private mirror migrations; use manager for mirror installs or explicitly opt into github.",
  },
  {
    name: "MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA",
    ok: !usesGithubProvider || Bun.env.MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA === "true",
    detail:
      "Required when MODEL_IMAGE_REBUILD_PROVIDER=github because GitHub commits/releases reveal model metadata.",
  },
  {
    name: "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
    ok: !usesGithubProvider || hasValue("MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY"),
    detail: "Required when MODEL_IMAGE_REBUILD_PROVIDER=github.",
  },
  {
    name: "MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
    ok: !usesGithubProvider || hasValue("MODEL_IMAGE_REBUILD_GITHUB_TOKEN"),
    detail: "Required when MODEL_IMAGE_REBUILD_PROVIDER=github.",
  },
  {
    name: "MODEL_IMAGE_RUNPOD_BUILD_POLLING",
    ok: !pollingEnabled || (hasValue("RUNPOD_API_KEY") && hasValue("RUNPOD_GENERATOR_ID")),
    detail: pollingEnabled
      ? "Enabled; requires RUNPOD_API_KEY and RUNPOD_GENERATOR_ID."
      : "Disabled; final build status must arrive through /api/v1/webhooks/model-image.",
  },
  wranglerCheck(
    "wrangler DB binding",
    wranglerConfig.includes('"binding": "DB"') && wranglerConfig.includes('"d1_databases"'),
    "Required D1 binding for account, model, and job state.",
  ),
  wranglerCheck(
    "wrangler R2 binding",
    wranglerConfig.includes('"binding": "R2"') && wranglerConfig.includes('"r2_buckets"'),
    "Required R2 binding for generated image storage.",
  ),
  wranglerCheck(
    "wrangler cron trigger",
    wranglerConfig.includes('"crons"') && wranglerConfig.includes("*/1 * * * *"),
    "Required for automatic RunPod build polling.",
  ),
  optional("CIVITAI_API_TOKEN", "Improves Civitai limits and private-token downloads."),
  optional("RUNPOD_DOWNLOADER_ID", "Only needed for the legacy downloader path."),
];

console.log("Self-host Worker readiness");
console.log("Values are not printed; this only reports whether each setting or binding is present.\n");

for (const check of checks) {
  printCheck(check);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error(`\nReadiness failed: ${failures.length} required setting(s) missing.`);
  process.exit(1);
}

console.log("\nReadiness passed.");
