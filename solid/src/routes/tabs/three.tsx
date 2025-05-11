import { createFileRoute } from "@tanstack/solid-router";
import { createEffect, createSignal } from "solid-js";
import { ImageList } from "~/components/image-list";
import useGeneratedJobs from "~/hooks/useGeneratedJobs";

export const Route = createFileRoute("/tabs/three")({
  component: RouteComponent,
});

function RouteComponent() {
  const [appliedFilters, setAppliedFilters] = createSignal({
    query: "",
    limit: 50,
  });

  const imagesQuery = useGeneratedJobs(appliedFilters);

  createEffect(() => {
    console.log(imagesQuery.data);
  });

  return (
    <>
      <main>
        <ImageList query={imagesQuery} />
      </main>
    </>
  );
}
