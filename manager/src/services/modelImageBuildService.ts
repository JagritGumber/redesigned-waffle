type TriggerModelImageBuildInput = {
  civitaiModelId: number;
  civitaiFileId?: number | null;
  downloadUrl?: string | null;
  runpodPath?: string | null;
  runpodJobId?: string | null;
};

type TriggerModelImageBuildResult =
  | {
      triggered: true;
      buildTriggerId: string | null;
      message: string;
    }
  | {
      triggered: false;
      buildTriggerId: null;
      message: string;
    };

export async function triggerModelImageBuild(
  input: TriggerModelImageBuildInput,
): Promise<TriggerModelImageBuildResult> {
  if (!input.civitaiFileId) {
    throw new Error("Cannot trigger model image rebuild without a Civitai file ID.");
  }
  if (!input.downloadUrl) {
    throw new Error("Cannot trigger model image rebuild without a model download URL.");
  }
  if (!input.runpodPath) {
    throw new Error("Cannot trigger model image rebuild without a target model path.");
  }

  const buildTriggerId = crypto.randomUUID();
  const payload = {
    event: "model.downloaded",
    buildTriggerId,
    civitaiModelId: input.civitaiModelId,
    civitaiFileId: input.civitaiFileId,
    downloadUrl: input.downloadUrl,
    runpodPath: input.runpodPath,
    runpodJobId: input.runpodJobId,
    cacheKey: `civitai-${input.civitaiModelId}-${input.civitaiFileId ?? "unknown"}`,
    migration: {
      id: `civitai-${input.civitaiModelId}-${input.civitaiFileId ?? "unknown"}`,
      url: input.downloadUrl,
      path: input.runpodPath,
    },
  };

  if (Bun.env.MODEL_IMAGE_REBUILD_PROVIDER === "mirror") {
    await dispatchPrivateMirrorWorkflow(payload);

    return {
      triggered: true,
      buildTriggerId,
      message: "Private mirror migration workflow queued. RunPod will build after the mirror commit.",
    };
  }

  return {
    triggered: false,
    buildTriggerId: null,
    message:
      "Model downloaded. MODEL_IMAGE_REBUILD_PROVIDER is not set to mirror, so image rebuild was not triggered.",
  };
}

async function dispatchPrivateMirrorWorkflow(payload: {
  buildTriggerId: string;
  migration: { id: string; url: string; path: string };
}) {
  const token = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_TOKEN;
  if (!token) {
    throw new Error("MODEL_IMAGE_REBUILD_PROVIDER=mirror requires MODEL_IMAGE_REBUILD_MIRROR_TOKEN.");
  }

  const repository = mirrorRepository();
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/model-migration.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "redesigned-waffle-manager",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          buildTriggerId: payload.buildTriggerId,
          migrationId: payload.migration.id,
          migrationUrl: payload.migration.url,
          migrationPath: payload.migration.path,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Private mirror workflow dispatch failed with ${response.status}: ${await response.text()}`);
  }
}

function mirrorRepository() {
  const origin = Bun.env.PUBLIC_REPOSITORY_URL || "https://github.com/JagritGumber/redesigned-waffle";
  const match = origin.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/);
  if (!match?.groups) {
    throw new Error(`Cannot derive private deploy mirror repository from PUBLIC_REPOSITORY_URL: ${origin}`);
  }

  return `${match.groups.owner}/${match.groups.repo}-deploy`;
}
