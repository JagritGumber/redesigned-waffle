import { Index, Match, Suspense, Switch } from "solid-js";
import { ModelCard } from "./model-card";
import { Grid } from "./ui/grid";
import type useDownloadedModels from "~/hooks/useDownloadedModels";
import { Loader } from "./loader";
import type useMarketplaceModels from "~/hooks/useMarketplaceModels";
import type useGenerationModels from "~/hooks/useGenerationModels";
import { cn } from "~/lib/utils";

export interface ModelListProps {
  query: ReturnType<
    | typeof useDownloadedModels
    | typeof useMarketplaceModels
    | typeof useGenerationModels
  >;
  size?: "sm" | "md" | "lg";
  class?: string;
}

export const ModelList = ({ query, size = "md", ...props }: ModelListProps) => {
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
              (
                query as ReturnType<
                  typeof useDownloadedModels | typeof useGenerationModels
                >
              ).data?.models !== undefined
            }
          >
            <Index
              each={
                (
                  query as ReturnType<
                    typeof useDownloadedModels | typeof useGenerationModels
                  >
                ).data?.models
              }
            >
              {(model) => <ModelCard model={model()} />}
            </Index>
          </Match>
          <Match
            when={
              (query as ReturnType<typeof useMarketplaceModels>).data?.pages !==
              undefined
            }
          >
            <Index
              each={(
                query as ReturnType<typeof useMarketplaceModels>
              )?.data?.pages.flatMap((page) => page.models)}
            >
              {(model) => <ModelCard model={model()} />}
            </Index>
          </Match>
        </Switch>
      </Grid>
    </Suspense>
  );
};
