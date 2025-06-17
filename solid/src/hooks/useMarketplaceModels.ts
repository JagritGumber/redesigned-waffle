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
    queryFn: ({ pageParam }) => fetchCivitAIModelsPage({ pageParam: pageParam as string }),
    initialPageParam: buildInitialUrl(appliedFilters()),
    getNextPageParam: (lastPage) => {
      return lastPage.nextPageUrl || undefined;
    },
  }));
};

export default useMarketplaceModels;
