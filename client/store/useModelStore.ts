import { create } from 'zustand';
import { CivitaiModelWithRelations } from '~/backend/schema/models';
import { Model } from '~/types/civitai';

interface ModelState {
  selectedModel: Model | null;
  setSelectedModel: (model: Model | null) => void;
  downloadedModel: CivitaiModelWithRelations | null;
}

export const useModelStore = create<ModelState>((set) => ({
  selectedModel: null,
  downloadedModel: null,
  setSelectedModel: (model) => set({ selectedModel: model }),
}));
