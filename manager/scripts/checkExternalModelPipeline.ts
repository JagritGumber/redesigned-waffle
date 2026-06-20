type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const dispatchDryRun = Bun.argv.includes("--dispatch-dry-run");

function hasValue(key: string) {
  return Boolean(Bun.env[key]?.trim());
}

function printCheck(check: Check) {
  const marker = check.ok ? "ok" : "failed";
  console.log(`${marker.padEnd(7)} ${check.name.padEnd(34)} ${check.detail}`);
}

function requireEnv(keys: string[]): boolean {
  let ok = true;
  for (const key of keys) {
    const present = hasValue(key);
    printCheck({
      name: key,
      ok: present,
      detail: present ? "Configured." : "Missing.",
    });
    ok = ok && present;
  }
  return ok;
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN}`,
    "User-Agent": "redesigned-waffle-manager",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function checkGithubWorkflow(): Promise<boolean> {
  const repository = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/model-image-rebuild.yml`,
    { headers: githubHeaders() },
  );

  if (!response.ok) {
    printCheck({
      name: "GitHub workflow",
      ok: false,
      detail: `Could not read workflow metadata (${response.status}).`,
    });
    return false;
  }

  const workflow = (await response.json()) as {
    name?: string;
    state?: string;
    path?: string;
  };
  const active = workflow.state === "active";
  printCheck({
    name: "GitHub workflow",
    ok: active,
    detail: active
      ? `Found active workflow at ${workflow.path ?? "unknown path"}.`
      : `Workflow state is ${workflow.state ?? "unknown"}.`,
  });
  return active;
}

async function dispatchGithubDryRun(): Promise<boolean> {
  const repository = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
  const timestamp = Date.now();
  const buildTriggerId = `smoke-${timestamp}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
    method: "POST",
    headers: {
      ...githubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "model-image-rebuild",
      client_payload: {
        dryRun: true,
        event: "model.downloaded",
        buildTriggerId,
        civitaiModelId: 0,
        civitaiFileId: 0,
        downloadUrl: "https://civitai.com/api/download/models/1",
        runpodPath: "/runpod-volume/workspace/models/external-smoke.safetensors",
        cacheKey: "external-smoke",
        migration: {
          id: `external-smoke-${timestamp}`,
          url: "https://civitai.com/api/download/models/1",
          path: "/runpod-volume/workspace/models/external-smoke.safetensors",
        },
      },
    }),
  });

  const ok = response.status === 204;
  printCheck({
    name: "GitHub dry-run dispatch",
    ok,
    detail: ok
      ? "repository_dispatch accepted; workflow will validate payload without creating a release."
      : `repository_dispatch failed (${response.status}).`,
  });
  return ok;
}

async function checkRunPodEndpoint(): Promise<boolean> {
  const response = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Bun.env.RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({
      query: `
        query ExternalModelPipelineEndpointCheck {
          myself {
            endpoints {
              id
              name
              builds {
                id
                state
                imageName
              }
            }
          }
        }
      `,
    }),
  });

  if (!response.ok) {
    printCheck({
      name: "RunPod endpoint",
      ok: false,
      detail: `GraphQL request failed (${response.status}).`,
    });
    return false;
  }

  const payload = (await response.json()) as {
    data?: {
      myself?: {
        endpoints?: Array<{
          id?: string;
          name?: string;
          builds?: unknown[];
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    printCheck({
      name: "RunPod endpoint",
      ok: false,
      detail: payload.errors.map((error) => error.message).join("; "),
    });
    return false;
  }

  const endpoint = payload.data?.myself?.endpoints?.find(
    (candidate) => candidate.id === Bun.env.RUNPOD_GENERATOR_ID,
  );
  const ok = Boolean(endpoint);
  printCheck({
    name: "RunPod endpoint",
    ok,
    detail: ok
      ? `Found generator endpoint; ${endpoint?.builds?.length ?? 0} build record(s) visible.`
      : "RUNPOD_GENERATOR_ID was not found for this API key.",
  });
  return ok;
}

console.log("External model pipeline check");
console.log("Values are not printed. Network calls are read-only unless --dispatch-dry-run is passed.\n");

let ok = requireEnv([
  "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
  "MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
  "RUNPOD_API_KEY",
  "RUNPOD_GENERATOR_ID",
]);

if (ok) {
  ok = (await checkGithubWorkflow()) && ok;
  ok = (await checkRunPodEndpoint()) && ok;
}

if (ok && dispatchDryRun) {
  ok = (await dispatchGithubDryRun()) && ok;
}

if (!ok) {
  console.error("\nExternal model pipeline check failed.");
  process.exit(1);
}

console.log(
  dispatchDryRun
    ? "\nExternal model pipeline dry-run dispatch passed."
    : "\nExternal model pipeline read-only checks passed.",
);
