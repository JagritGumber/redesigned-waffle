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
  const body = {
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

  if (Bun.env.MODEL_IMAGE_REBUILD_PROVIDER === "github") {
    if (!Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY || !Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN) {
      throw new Error(
        "MODEL_IMAGE_REBUILD_PROVIDER=github requires MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY and MODEL_IMAGE_REBUILD_GITHUB_TOKEN.",
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${Bun.env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${Bun.env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN}`,
          "User-Agent": "redesigned-waffle-manager",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          event_type: "model-image-rebuild",
          client_payload: body,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub repository dispatch failed with ${response.status}: ${errorBody}`);
    }

    return {
      triggered: true,
      buildTriggerId,
      message: "GitHub model image rebuild workflow queued.",
    };
  }

  const webhookUrl = Bun.env.MODEL_IMAGE_REBUILD_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      triggered: false,
      buildTriggerId: null,
      message:
        "Model downloaded. MODEL_IMAGE_REBUILD_WEBHOOK_URL is not configured, so image rebuild was not triggered.",
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(Bun.env.MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${Bun.env.MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Model image rebuild webhook failed with ${response.status}: ${
        payload ? JSON.stringify(payload) : response.statusText
      }`,
    );
  }

  return {
    triggered: true,
    buildTriggerId:
      typeof payload?.id === "string"
        ? payload.id
        : typeof payload?.buildId === "string"
          ? payload.buildId
          : buildTriggerId,
    message: "Model image rebuild queued.",
  };
}
