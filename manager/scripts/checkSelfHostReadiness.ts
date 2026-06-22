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

function printCheck(check: Check) {
  const marker = check.ok ? "ok" : "missing";
  console.log(`${marker.padEnd(7)} ${check.name.padEnd(40)} ${check.detail}`);
}

const provider = Bun.env.MODEL_IMAGE_REBUILD_PROVIDER || "mirror";
const usesMirrorProvider = provider === "mirror";
const pollingEnabled = Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING !== "false";

const checks: Check[] = [
  required("HOST_URL", "Public manager URL used for callbacks and app links."),
  required("FRONTEND_URL", "Allowed Solid frontend origin."),
  required("RUNPOD_API_KEY", "Required for generation and RunPod build polling."),
  required("RUNPOD_GENERATOR_ID", "RunPod Serverless generator endpoint ID."),
  required("RUNPOD_WEBHOOK_URL", "Public manager webhook base for RunPod generation jobs."),
  required("R2_ACCESS_KEY_ID", "Object storage access key."),
  required("R2_SECRET_ACCESS_KEY", "Object storage secret key."),
  required("R2_PUBLIC_BUCKET_URL", "Public object storage URL."),
  required("R2_BUCKET_NAME", "Object storage bucket name."),
  required("MODEL_IMAGE_WEBHOOK_TOKEN", "Shared token for model-image build callbacks."),
  {
    name: "MODEL_IMAGE_REBUILD_PROVIDER",
    ok: usesMirrorProvider,
    detail: "Use mirror for private RunPod deploy repos.",
  },
  {
    name: "MODEL_IMAGE_REBUILD_MIRROR_PATH",
    ok: !usesMirrorProvider || hasValue("MODEL_IMAGE_REBUILD_MIRROR_PATH"),
    detail: "Required when MODEL_IMAGE_REBUILD_PROVIDER=mirror. Must point to a private git clone watched by RunPod.",
  },
  {
    name: "MODEL_IMAGE_RUNPOD_BUILD_POLLING",
    ok: !pollingEnabled || (hasValue("RUNPOD_API_KEY") && hasValue("RUNPOD_GENERATOR_ID")),
    detail: pollingEnabled
      ? "Enabled; requires RUNPOD_API_KEY and RUNPOD_GENERATOR_ID."
      : "Disabled; final build status must arrive through /api/v1/webhooks/model-image.",
  },
  optional("CIVITAI_API_TOKEN", "Improves Civitai limits and private-token downloads."),
];

console.log("Self-host manager readiness");
console.log("Values are not printed; this only reports whether each setting is present.\n");

for (const check of checks) {
  printCheck(check);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error(`\nReadiness failed: ${failures.length} required setting(s) missing.`);
  process.exit(1);
}

console.log("\nReadiness passed.");
