import { createFileRoute } from "@tanstack/solid-router";
import { createEffect } from "solid-js";
import { ImageList } from "~/components/image-list";
import useGeneratedJobs from "~/hooks/useGeneratedJobs";

export const Route = createFileRoute("/tabs/three")({
  component: RouteComponent,
});

function RouteComponent() {
  const imagesQuery = useGeneratedJobs();

  createEffect(() => {
    console.log(imagesQuery.data);
  });

  return (
    <>
      <main>
        <ImageList query={imagesQuery} size="lg" />
      </main>
    </>
  );
}
