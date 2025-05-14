import { Grid } from "./ui/grid";
import { Loader } from "./loader";
import { cn } from "~/lib/utils";
import type useGeneratedJobs from "~/hooks/useGeneratedJobs";
import { ImageCard } from "./image-card";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  Suspense,
} from "solid-js";

export interface ImageListProps {
  query: ReturnType<typeof useGeneratedJobs>;
  size?: "sm" | "md" | "lg";
  class?: string;
}

export const ImageList = ({ query, size = "md", ...props }: ImageListProps) => {
  const [sentinel, setSentinel] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    const currentSentinel = sentinel();

    if (currentSentinel && query.hasNextPage) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            entries[0]?.isIntersecting &&
            query.hasNextPage &&
            !query.isFetchingNextPage
          ) {
            query.fetchNextPage();
          }
        },
        {
          threshold: 0.1,
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
        <For each={query.data?.pages?.flatMap((page) => page.items)}>
          {(image) => <ImageCard image={image} />}
        </For>
      </Grid>
      <Show when={query.hasNextPage}>
        <div ref={setSentinel} style={{ height: "10px", width: "100%" }} />
      </Show>
      <Show
        when={
          query.isFetchingNextPage &&
          query.data?.pages &&
          query.data.pages.length > 0
        }
      >
        <div
          style={{
            display: "flex",
            "justify-content": "center",
            padding: "20px",
          }}
        >
          <Loader />
        </div>
      </Show>
    </Suspense>
  );
};
