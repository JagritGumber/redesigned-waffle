import { ModelTypes } from "@/types/models";

export type ModelImageBuildEnv = {
  MODEL_IMAGE_REBUILD_PROVIDER?: string;
  MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA?: string;
  MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY?: string;
  MODEL_IMAGE_REBUILD_GITHUB_TOKEN?: string;
  MODEL_IMAGE_REBUILD_WEBHOOK_URL?: string;
  MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN?: string;
};

export type TriggerModelImageBuildInput = {
  buildTriggerId: string;
  civitaiModelId: number;
  civitaiFileId: number;
  downloadUrl: string;
  runpodPath: string;
  modelType: ModelTypes;
};

export function isModelImageRebuildConfigured(env: ModelImageBuildEnv) {
  return (
    env.MODEL_IMAGE_REBUILD_PROVIDER === "github" ||
    Boolean(env.MODEL_IMAGE_REBUILD_WEBHOOK_URL)
  );
}

export async function triggerModelImageBuild(
  env: ModelImageBuildEnv,
  input: TriggerModelImageBuildInput
) {
  const payload = {
    event: "model.downloaded",
    buildTriggerId: input.buildTriggerId,
    civitaiModelId: input.civitaiModelId,
    civitaiFileId: input.civitaiFileId,
    downloadUrl: input.downloadUrl,
    runpodPath: input.runpodPath,
    modelType: input.modelType,
    cacheKey: `civitai-${input.civitaiModelId}-${input.civitaiFileId}`,
    migration: {
      id: `civitai-${input.civitaiModelId}-${input.civitaiFileId}`,
      url: input.downloadUrl,
      path: input.runpodPath,
    },
  };

  if (env.MODEL_IMAGE_REBUILD_PROVIDER === "github") {
    if (env.MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA !== "true") {
      throw new Error(
        "MODEL_IMAGE_REBUILD_PROVIDER=github writes model migration metadata to GitHub. Set MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA=true only for private repos or non-sensitive installs."
      );
    }

    const repository = env.MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY;
    const token = env.MODEL_IMAGE_REBUILD_GITHUB_TOKEN;

    if (!repository || !token) {
      throw new Error(
        "MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY and MODEL_IMAGE_REBUILD_GITHUB_TOKEN are required for GitHub model image rebuilds."
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${repository}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "redesigned-waffle-worker",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          event_type: "model-image-rebuild",
          client_payload: payload,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `GitHub repository dispatch failed: ${response.status} ${await response.text()}`
      );
    }

    return {
      provider: "github",
      triggerId: input.buildTriggerId,
      status: "BUILD_QUEUED",
    };
  }

  const webhookUrl = env.MODEL_IMAGE_REBUILD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("No model image rebuild provider configured.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${env.MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Model image rebuild webhook failed: ${response.status} ${await response.text()}`
    );
  }

  return {
    provider: "webhook",
    triggerId: input.buildTriggerId,
    status: "BUILD_QUEUED",
  };
}
