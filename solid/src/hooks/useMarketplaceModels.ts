import { useInfiniteQuery } from "@tanstack/solid-query";
import { createMemo, type Accessor } from "solid-js";
import {
  fetchCivitAIModelsPage,
  buildInitialUrl,
  type FetchModelsParams,
} from "~/utils/fetchCivitaiModels";

const useMarketplaceModels = (appliedFilters: Accessor<FetchModelsParams>) => {
  const queryKey = createMemo(() => ["models", appliedFilters()]);

  return useInfiniteQuery(() => ({
    queryKey: queryKey(),
    queryFn: ({ pageParam }) => fetchCivitAIModelsPage({ pageParam }),
    initialPageParam: buildInitialUrl(appliedFilters()),
    getNextPageParam: (lastPage) => {
      return lastPage.nextPageUrl;
    },
  }));
};

export default useMarketplaceModels;
