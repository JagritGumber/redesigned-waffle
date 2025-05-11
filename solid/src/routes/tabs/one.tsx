import { createFileRoute, Link } from "@tanstack/solid-router";
import { Storefront, Trash } from "phosphor-solid";
import { ModelList } from "~/components/model-list";
import { Button } from "~/components/ui/button";
import useDownloadedModels from "~/hooks/useDownloadedModels";

export const Route = createFileRoute("/tabs/one")({
  component: RouteComponent,
});

function RouteComponent() {
  const modelQuery = useDownloadedModels();

  return (
    <>
      <header>
        <nav class="flex p-2 justify-between">
          <Link to="/marketplace">
            <Button size="icon" variant={"outline"}>
              <Storefront weight="bold" />
            </Button>
          </Link>
          <Button size="icon" variant={"outline"}>
            <Trash weight="bold" color="red" />
          </Button>
        </nav>
      </header>
      <main>
        <ModelList query={modelQuery} size="lg" />
      </main>
    </>
  );
}
