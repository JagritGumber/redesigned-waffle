import { Store } from "@tanstack/solid-store";
import type { FetchModelsParams } from "~/utils/fetchCivitaiModels";

export const marketplaceStore = new Store<FetchModelsParams>({});

export const setSearchText = (text: string) => {
  marketplaceStore.setState((state) => ({
    ...state,
    query: text,
  }));
};
