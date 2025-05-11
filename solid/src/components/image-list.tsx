import { Grid } from "./ui/grid";
import { Loader } from "./loader";
import { cn } from "~/lib/utils";
import type useGeneratedJobs from "~/hooks/useGeneratedJobs";
import { ImageCard } from "./image-card";
import { Index, Suspense } from "solid-js";

export interface ImageListProps {
  query: ReturnType<typeof useGeneratedJobs>;
  size?: "sm" | "md" | "lg";
  class?: string;
}

export const ImageList = ({ query, size = "md", ...props }: ImageListProps) => {
  return (
    <Suspense fallback={<Loader />}>
      <Grid
        colsSm={size === "lg" ? 2 : size === "sm" ? 4 : 3}
        colsMd={size === "lg" ? 3 : size === "sm" ? 5 : 4}
        colsLg={size === "lg" ? 4 : size === "sm" ? 6 : 5}
        cols={size === "lg" ? 2 : size === "sm" ? 4 : 3}
        class={cn("w-full gap-2 p-2", props.class)}
      >
        <Index each={query.data?.pages?.flatMap((page) => page.items)}>
          {(image) => <ImageCard image={image()} />}
        </Index>
      </Grid>
    </Suspense>
  );
};
