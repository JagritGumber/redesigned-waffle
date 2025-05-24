import { Store } from "@tanstack/solid-store";
import type { CivitaiModelWithRelations } from "~/backend/schema";
import type { Model } from "~/types/civitai";
import { generateRandomSeed } from "~/utils/generation";

export interface GenerationStore {
  checkpoint: {
    modelId: CivitaiModelWithRelations["id"] | Model["id"];
    modelVersionId:
      | CivitaiModelWithRelations["modelVersions"]["0"]["id"]
      | Model["modelVersions"]["0"]["id"];
  } | null;
  lora: null | Array<{
    modelId: CivitaiModelWithRelations["id"] | Model["id"];
    modelVersionId:
      | CivitaiModelWithRelations["modelVersions"]["0"]["id"]
      | Model["modelVersions"]["0"]["id"];
    weight: number;
  }>;
  textualInversions: null | Array<{
    modelId: CivitaiModelWithRelations["id"] | Model["id"];
    modelVersionId:
      | CivitaiModelWithRelations["modelVersions"]["0"]["id"]
      | Model["modelVersions"]["0"]["id"];
    weight: number;
    type: "negative" | "positive";
  }>;
  prompt: string;
  width: number;
  height: number;
  negativePrompt: string;
  seed: number;
  randomSeed: boolean;
  numImages: number;
}

export const generationStore = new Store<GenerationStore>({
  checkpoint: null,
  lora: null,
  textualInversions: null,
  prompt: "",
  width: 768,
  height: 1280,
  negativePrompt: "",
  seed: generateRandomSeed(),
  randomSeed: true,
  numImages: 1,
});

export const setPrompt = (prompt: string) => {
  generationStore.setState((state) => ({
    ...state,
    prompt,
  }));
};

export const setWidth = (width: number) => {
  generationStore.setState((state) => ({
    ...state,
    width,
  }));
};

export const setHeight = (height: number) => {
  generationStore.setState((state) => ({
    ...state,
    height,
  }));
};

export const setNegativePrompt = (negativePrompt: string) => {
  generationStore.setState((state) => ({
    ...state,
    negativePrompt,
  }));
};

export const randomizeSeed = () => {
  generationStore.setState((state) => ({
    ...state,
    seed: generateRandomSeed(),
  }));
};

export const setSeed = (seed: number) => {
  generationStore.setState((state) => ({
    ...state,
    seed,
  }));
};

export const setCheckpoint = (modelId: number, modelVersionId: number) => {
  generationStore.setState((store) => ({
    ...store,
    checkpoint: {
      modelId,
      modelVersionId,
    },
  }));
};

export const setLora = (modelId: number, modelVersionId: number) => {
  generationStore.setState((state) => {
    const idx = state.lora?.findIndex((lora) => lora.modelId === modelId) ?? -1;
    if (idx !== -1) {
      const loras = state.lora;
      loras?.splice(idx, 1);
      return {
        ...state,
        lora: loras,
      };
    }
    return {
      ...state,
      lora: [...(state.lora ?? []), { modelId, modelVersionId, weight: 0.6 }],
    };
  });
};

export const removeTti = (modelId: number) => {
  generationStore.setState((state) => {
    return {
      ...state,
      textualInversions: [
        ...(state.textualInversions?.filter((tti) => tti.modelId !== modelId) ??
          []),
      ],
    };
  });
};

export const setTti = (
  modelId: number,
  modelVersionId: number,
  type: "negative" | "positive"
) => {
  generationStore.setState((state) => {
    if (state.textualInversions?.find((tti) => tti.modelId === modelId)) {
      return {
        ...state,
        textualInversions: [
          ...state.textualInversions.filter((tti) => tti.modelId !== modelId),
          { modelId, modelVersionId, weight: 0.6, type },
        ],
      };
    }
    return {
      ...state,
      textualInversions: [
        ...(state.textualInversions ?? []),
        { modelId, modelVersionId, weight: 0.6, type },
      ],
    };
  });
};

export const setNumImages = (numImages: number) => {
  generationStore.setState((state) => ({
    ...state,
    numImages,
  }));
};

export const setRandomSeed = (randomSeed: boolean) => {
  generationStore.setState((state) => ({
    ...state,
    randomSeed,
  }));
};
