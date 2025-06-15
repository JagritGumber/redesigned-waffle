import { Grid } from "./ui/grid";
import { Loader } from "./loader";
import { cn } from "~/lib/utils";
import type { SelectGeneratorJob } from "~/backend/schema";
import { ImageCard } from "./image-card";
import { createEffect, createSignal, For, onCleanup, Show, Suspense } from "solid-js";
import type { Accessor } from "solid-js";
import type useGeneratedJobs from "~/hooks/useGeneratedJobs";

export type DisplayGeneratorJob = SelectGeneratorJob & { isProcessing?: boolean };

export interface ImageListProps {
  items: Accessor<DisplayGeneratorJob[]>;
  query: ReturnType<typeof useGeneratedJobs>;
  size?: "sm" | "md" | "lg";
  class?: string;
}

export const ImageList = ({ items, query, size = "md", ...props }: ImageListProps) => {
  const [sentinel, setSentinel] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    const currentSentinel = sentinel();

    if (currentSentinel) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            entries[0]?.isIntersecting &&
            query.hasNextPage &&
            !query.isFetchingNextPage &&
            !query.isFetching
          ) {
            query.fetchNextPage();
          }
        },
        {
          threshold: 0.5,
        },
      );
      observer.observe(currentSentinel);
      onCleanup(() => {
        observer.unobserve(currentSentinel);
        observer.disconnect();
      });
    }
  });

  return (
    <Suspense fallback={<Loader />}>
      <Grid
        colsSm={size === "lg" ? 2 : size === "sm" ? 4 : 3}
        colsMd={size === "lg" ? 3 : size === "sm" ? 5 : 4}
        colsLg={size === "lg" ? 4 : size === "sm" ? 6 : 5}
        cols={size === "lg" ? 2 : size === "sm" ? 4 : 3}
        class={cn("w-full gap-2 p-2", props.class)}
      >
        <For each={items()}>
          {(image) => <ImageCard image={image} isProcessing={image.isProcessing} />}
        </For>
      </Grid>
      <Show when={query.hasNextPage}>
        <div ref={setSentinel} style={{ height: "10px", width: "100%" }} />
      </Show>
      <Show when={(query.isFetchingNextPage || query.isFetching) && items().length > 0}>
        <div
          style={{
            display: "flex",
            "justify-content": "center",
            padding: "20px",
          }}
        >
          Loading more
        </div>
      </Show>
    </Suspense>
  );
};
