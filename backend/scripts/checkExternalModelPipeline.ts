type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const dispatchDryRun = Bun.argv.includes("--dispatch-dry-run");
const waitForDryRun = Bun.argv.includes("--wait");
const DRY_RUN_WAIT_TIMEOUT_MS = 3 * 60 * 1000;
const DRY_RUN_POLL_INTERVAL_MS = 5 * 1000;

function argValue(name: string): string | null {
  const exact = Bun.argv.find((value) => value.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1).trim() || null;

  const index = Bun.argv.indexOf(name);
  if (index >= 0) return Bun.argv[index + 1]?.trim() || null;

  return null;
}

const releaseTagToVerify = argValue("--verify-release");

function hasValue(key: string) {
  return Boolean(Bun.env[key]?.trim());
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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
    "User-Agent": "redesigned-waffle-worker",
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

async function checkWorkerHealth(): Promise<boolean> {
  const hostUrl = Bun.env.HOST_URL?.trim() || Bun.env.RUNPOD_WEBHOOK_URL?.trim();
  if (!hostUrl) {
    printCheck({
      name: "Worker callback URL",
      ok: false,
      detail: "HOST_URL or RUNPOD_WEBHOOK_URL is missing.",
    });
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(joinUrl(hostUrl, "/api/v1/health"), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      printCheck({
        name: "Worker callback URL",
        ok: false,
        detail: `Health check returned ${response.status}.`,
      });
      return false;
    }

    const payload = (await response.json()) as { status?: string; service?: string };
    const ok = payload.status === "ok";
    printCheck({
      name: "Worker callback URL",
      ok,
      detail: ok
        ? `Public health endpoint is reachable for ${payload.service ?? "worker"}.`
        : `Health response status is ${payload.status ?? "missing"}.`,
    });
    return ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    printCheck({
      name: "Worker callback URL",
      ok: false,
      detail: `Health check failed: ${message}.`,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkGithubRelease(tag: string): Promise<boolean> {
  const repository = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: githubHeaders() },
  );

  if (!response.ok) {
    printCheck({
      name: "GitHub model release",
      ok: false,
      detail: `Release ${tag} was not readable (${response.status}).`,
    });
    return false;
  }

  const release = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
  };
  const ok = release.tag_name === tag;
  printCheck({
    name: "GitHub model release",
    ok,
    detail: ok
      ? `Found ${tag}: ${release.html_url ?? "release URL unavailable"}`
      : `Expected ${tag}, got ${release.tag_name ?? "unknown"}.`,
  });
  return ok;
}

async function dispatchGithubDryRun(): Promise<boolean> {
  const repository = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
  const timestamp = Date.now();
  const buildTriggerId = `worker-smoke-${timestamp}`;
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
        runpodPath: "/runpod-volume/workspace/models/worker-external-smoke.safetensors",
        cacheKey: "worker-external-smoke",
        migration: {
          id: `worker-external-smoke-${timestamp}`,
          url: "https://civitai.com/api/download/models/1",
          path: "/runpod-volume/workspace/models/worker-external-smoke.safetensors",
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
  if (!ok || !waitForDryRun) return ok;

  return waitForGithubDryRun(buildTriggerId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGithubDryRun(buildTriggerId: string): Promise<boolean> {
  const repository = Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
  const deadline = Date.now() + DRY_RUN_WAIT_TIMEOUT_MS;
  const expectedTitle = `Model image rebuild ${buildTriggerId}`;

  while (Date.now() < deadline) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/model-image-rebuild.yml/runs?event=repository_dispatch&per_page=20`,
      { headers: githubHeaders() },
    );

    if (!response.ok) {
      printCheck({
        name: "GitHub dry-run workflow",
        ok: false,
        detail: `Could not read workflow runs (${response.status}).`,
      });
      return false;
    }

    const payload = (await response.json()) as {
      workflow_runs?: Array<{
        id?: number;
        display_title?: string;
        status?: string;
        conclusion?: string | null;
        html_url?: string;
      }>;
    };
    const run = payload.workflow_runs?.find((candidate) => candidate.display_title === expectedTitle);

    if (run?.status === "completed") {
      const ok = run.conclusion === "success";
      printCheck({
        name: "GitHub dry-run workflow",
        ok,
        detail: ok
          ? `Completed successfully: ${run.html_url ?? `run ${run.id}`}`
          : `Completed with conclusion ${run.conclusion ?? "unknown"}: ${run.html_url ?? `run ${run.id}`}`,
      });
      return ok;
    }

    if (run) {
      printCheck({
        name: "GitHub dry-run workflow",
        ok: true,
        detail: `Found run ${run.id}; status is ${run.status ?? "unknown"}.`,
      });
    }

    await sleep(DRY_RUN_POLL_INTERVAL_MS);
  }

  printCheck({
    name: "GitHub dry-run workflow",
    ok: false,
    detail: `Timed out waiting for ${expectedTitle}.`,
  });
  return false;
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

async function checkRunPodReleaseBuild(tag: string): Promise<boolean> {
  const response = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Bun.env.RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({
      query: `
        query ExternalModelPipelineReleaseCheck {
          myself {
            endpoints {
              id
              builds {
                id
                state
                imageName
                commitMessage
                error
                completedAt
              }
            }
          }
        }
      `,
    }),
  });

  if (!response.ok) {
    printCheck({
      name: "RunPod release build",
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
          builds?: Array<{
            id?: string;
            state?: string;
            imageName?: string;
            commitMessage?: string;
            error?: string;
            completedAt?: string;
          }>;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    printCheck({
      name: "RunPod release build",
      ok: false,
      detail: payload.errors.map((error) => error.message).join("; "),
    });
    return false;
  }

  const endpoint = payload.data?.myself?.endpoints?.find(
    (candidate) => candidate.id === Bun.env.RUNPOD_GENERATOR_ID,
  );
  const build = endpoint?.builds?.find((candidate) =>
    [candidate.id, candidate.imageName].some((value) => value?.includes(tag)),
  );
  const ok = Boolean(build);
  printCheck({
    name: "RunPod release build",
    ok,
    detail: ok
      ? `${tag} build state is ${build?.state ?? "unknown"}${
          build?.completedAt ? `; completed at ${build.completedAt}` : ""
        }${build?.error ? `; error: ${build.error}` : ""}.`
      : `No visible RunPod build matched ${tag} on RUNPOD_GENERATOR_ID.`,
  });
  return ok;
}

console.log("External Worker model pipeline check");
console.log(
  "Values are not printed. Network calls are read-only unless --dispatch-dry-run is passed; add --wait to wait for the dry-run workflow result. Use --verify-release <tag> to check a real model release and RunPod build.\n",
);

let ok = requireEnv([
  "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY",
  "MODEL_IMAGE_REBUILD_GITHUB_TOKEN",
  "RUNPOD_API_KEY",
  "RUNPOD_GENERATOR_ID",
]);

if (ok) {
  ok = (await checkWorkerHealth()) && ok;
  ok = (await checkGithubWorkflow()) && ok;
  ok = (await checkRunPodEndpoint()) && ok;
}

if (ok && dispatchDryRun) {
  ok = (await dispatchGithubDryRun()) && ok;
}

if (ok && releaseTagToVerify) {
  ok = (await checkGithubRelease(releaseTagToVerify)) && ok;
  ok = (await checkRunPodReleaseBuild(releaseTagToVerify)) && ok;
}

if (!ok) {
  console.error("\nExternal Worker model pipeline check failed.");
  process.exit(1);
}

console.log(
  dispatchDryRun
    ? waitForDryRun
      ? "\nExternal Worker model pipeline dry-run workflow passed."
      : "\nExternal Worker model pipeline dry-run dispatch passed."
    : releaseTagToVerify
      ? "\nExternal Worker model pipeline release check passed."
      : "\nExternal Worker model pipeline read-only checks passed.",
);
