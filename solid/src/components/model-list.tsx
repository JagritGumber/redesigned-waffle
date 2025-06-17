import { Index, Match, Suspense, Switch, createEffect, onCleanup } from "solid-js";
import { ModelCard } from "./model-card";
import { Grid } from "./ui/grid";
import type useDownloadedModels from "~/hooks/useDownloadedModels";
import { Loader } from "./loader";
import type useMarketplaceModels from "~/hooks/useMarketplaceModels";
import type useGenerationModels from "~/hooks/useGenerationModels";
import { cn } from "~/lib/utils";

export interface ModelListProps {
  query: ReturnType<
    typeof useDownloadedModels | typeof useMarketplaceModels | typeof useGenerationModels
  >;
  size?: "sm" | "md" | "lg";
  class?: string;
  selectable?: boolean;
}

export const ModelList = ({ query, size = "md", selectable = false, ...props }: ModelListProps) => {
  let endOfListRef: HTMLDivElement | undefined;

  createEffect(() => {
    const marketplaceQuery = query as ReturnType<typeof useMarketplaceModels>;
    const fetchNextPage = marketplaceQuery.fetchNextPage;
    const hasNextPage = marketplaceQuery.hasNextPage;
    const isFetchingNextPage = marketplaceQuery.isFetchingNextPage;

    if (!endOfListRef || !fetchNextPage || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(endOfListRef);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  const isMarketplaceQuery = (
    q: ReturnType<
      typeof useDownloadedModels | typeof useMarketplaceModels | typeof useGenerationModels
    >,
  ): q is ReturnType<typeof useMarketplaceModels> => {
    return (q as ReturnType<typeof useMarketplaceModels>).data?.pages !== undefined;
  };

  const isFetchingNextPage = isMarketplaceQuery(query) ? query.isFetchingNextPage : false;

  return (
    <Suspense fallback={<Loader />}>
      <Grid
        colsSm={size === "lg" ? 2 : size === "sm" ? 4 : 3}
        colsMd={size === "lg" ? 3 : size === "sm" ? 5 : 4}
        colsLg={size === "lg" ? 4 : size === "sm" ? 6 : 5}
        cols={size === "lg" ? 2 : size === "sm" ? 4 : 3}
        class={cn("w-full gap-2 px-2", props.class)}
      >
        <Switch>
          <Match
            when={
              (query as ReturnType<typeof useDownloadedModels | typeof useGenerationModels>).data
                ?.models !== undefined
            }
          >
            <Index
              each={
                (query as ReturnType<typeof useDownloadedModels | typeof useGenerationModels>).data
                  ?.models
              }
            >
              {(model) => <ModelCard model={model()} selectable={selectable} />}
            </Index>
          </Match>
          <Match
            when={(query as ReturnType<typeof useMarketplaceModels>).data?.pages !== undefined}
          >
            <Index
              each={(query as ReturnType<typeof useMarketplaceModels>)?.data?.pages.flatMap(
                (page) => page.models,
              )}
            >
              {(model) => <ModelCard model={model()} selectable={selectable} />}
            </Index>
          </Match>
        </Switch>
        <div ref={endOfListRef} class="col-span-full h-1" />
        {isFetchingNextPage && (
          <div class="col-span-full flex justify-center py-4">
            <Loader />
          </div>
        )}
      </Grid>
    </Suspense>
  );
};
