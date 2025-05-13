import { Store } from "@tanstack/solid-store";
import type { CivitaiModelWithRelations } from "~/backend/schema";

export interface GenerationStore {
  checkpoint: null | CivitaiModelWithRelations;
  lora: null | Array<{
    model: CivitaiModelWithRelations;
    weight: number;
  }>;
  textualInversions: null | Array<{
    tti: CivitaiModelWithRelations;
    type?: "negative" | "positive";
  }>;
  prompt: string | null;
  width: number;
  height: number;
}

export const generationStore = new Store<GenerationStore>({
  checkpoint: null,
  lora: null,
  textualInversions: null,
  prompt: null,
  width: 768,
  height: 1280,
});
