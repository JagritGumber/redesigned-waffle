import { createFileRoute, Link } from "@tanstack/solid-router";
import { CaretLeft, Funnel } from "phosphor-solid";
import { createSignal } from "solid-js";
import { ModelList } from "~/components/model-list";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import useMarketplaceModels from "~/hooks/useMarketplaceModels";
import type { FetchModelsParams } from "~/utils/fetchCivitaiModels";

export const Route = createFileRoute("/marketplace")({
  component: RouteComponent,
});

function RouteComponent() {
  const [searchText, setSearchText] = createSignal("");
  const [appliedFilters, setAppliedFilters] = createSignal<FetchModelsParams>(
    {},
  );

  const modelsQuery = useMarketplaceModels(appliedFilters);

  return (
    <>
      <header>
        <nav class="flex p-2 gap-2">
          <Link to="/tabs/one">
            <Button variant={"outline"} size={"icon"} class="flex-shrink-0">
              <CaretLeft weight="bold" />
            </Button>
          </Link>
          <form
            class="contents"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedFilters((prev) => ({
                ...prev,
                query: searchText(),
              }));
            }}
          >
            <TextField class="flex-grow">
              <TextFieldInput
                type="search"
                placeholder="Search Model"
                value={searchText()}
                onInput={(e) => setSearchText(e.currentTarget.value)}
              />
            </TextField>
            <Button
              type="button"
              variant={"outline"}
              size={"icon"}
              class="flex-shrink-0"
            >
              <Funnel weight="bold" />
            </Button>
            <Button type="submit">Search</Button>
          </form>
        </nav>
      </header>
      <main>
        <ModelList query={modelsQuery} size="lg" />
      </main>
    </>
  );
}
