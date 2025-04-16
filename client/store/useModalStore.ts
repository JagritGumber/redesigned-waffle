import { create } from 'zustand';
import { Model } from '~/types/civitai';

interface ModelState {
  selectedModel: Model | null;
  setSelectedModel: (model: Model | null) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  selectedModel: null,
  setSelectedModel: (model) => set({ selectedModel: model }),
}));
