import { ModelTypes } from "@/types/models";

export type ModelImageBuildEnv = {
  MODEL_IMAGE_REBUILD_PROVIDER?: string;
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
  return false;
}

export async function triggerModelImageBuild(
  env: ModelImageBuildEnv,
  input: TriggerModelImageBuildInput
) {
  throw new Error(
    "No Worker-compatible model image rebuild provider is available. Use the manager mirror provider for private RunPod deploy mirrors."
  );
}
