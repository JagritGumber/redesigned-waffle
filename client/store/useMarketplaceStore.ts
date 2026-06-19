import { create } from 'zustand';
import { Model } from '~/types/civitai';
import axios from 'axios';

interface MarketplaceStore {
  models: Model[];
  loading: boolean;
  error: string | null;
  nextPageUrl: string | null;
  hasMore: boolean;
  isFetchingMore: boolean;
  hasSearchedOrFiltered: boolean;
  fetchModels: (
    pageNumber?: number,
    query?: string,
    filters?: { tag?: string; username?: string; types?: string[]; sort?: string }
  ) => Promise<void>;
  loadMore: () => Promise<void>;
  setHasSearchedOrFiltered: (value: boolean) => void;
  setModels: (models: Model[]) => void; // Helper to directly set models
}

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  models: [],
  loading: false,
  error: null,
  nextPageUrl: null,
  hasMore: false,
  isFetchingMore: false,
  hasSearchedOrFiltered: false,
  setHasSearchedOrFiltered: (value) => set({ hasSearchedOrFiltered: value }),
  setModels: (newModels) => set({ models: newModels }),
  fetchModels: async (pageNumber = 1, query = '', filters = {}) => {
    set({
      loading:
        (pageNumber === 1 && !query && Object.keys(filters).length === 0) || query.length >= 0,
      error: null,
    });
    try {
      let url = `https://civitai.com/api/v1/models?page=${pageNumber}&query=${query}&token=${process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN}&nsfw=${false}`;
      if (filters.tag) {
        url += `&tag=${filters.tag}`;
      }
      if (filters.username) {
        url += `&username=${filters.username}`;
      }
      if (filters.types && filters.types.length > 0) {
        url += `&types=${filters.types.join(',')}`;
      }
      if (filters.sort) {
        url += `&sort=${filters.sort}`;
      }
      const response = await axios.get(url);
      const newModels = response.data.items || [];
      set((state) => ({
        models: pageNumber === 1 ? newModels : [...state.models, ...newModels],
        nextPageUrl: response.data.metadata?.nextPage || null,
        hasMore: response.data.metadata?.nextPage !== null,
      }));
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: false });
    }
  },
  loadMore: async () => {
    const { nextPageUrl, isFetchingMore, models } = get();
    if (nextPageUrl && !isFetchingMore) {
      set({ isFetchingMore: true, error: null });
      try {
        const response = await axios.get(nextPageUrl);
        const newModels = response.data.items || [];
        set({
          models: [...models, ...newModels],
          nextPageUrl: response.data.metadata?.nextPage || null,
          hasMore: response.data.metadata?.nextPage !== null,
        });
      } catch (e: any) {
        set({ error: e.message });
      } finally {
        set({ isFetchingMore: false });
      }
    }
  },
}));
