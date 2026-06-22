import { createFileRoute, Link } from "@tanstack/solid-router";
import { useStore } from "@tanstack/solid-store";
import { CaretLeft, Funnel } from "phosphor-solid";
import { createMemo, createSignal } from "solid-js";
import { ModelList } from "~/components/model-list";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import useDownloadedModels from "~/hooks/useDownloadedModels";
import useMarketplaceModels from "~/hooks/useMarketplaceModels";
import { marketplaceStore, setSearchText } from "~/store/marketplace";
import type { FetchModelsParams } from "~/utils/fetchCivitaiModels";

export const Route = createFileRoute("/marketplace")({
  component: RouteComponent,
});

function RouteComponent() {
  const storeState = useStore(marketplaceStore, (state) => state);
  const [appliedFilters, setAppliedFilters] = createSignal<FetchModelsParams>(
    marketplaceStore.state,
  );
  const searchText = useStore(marketplaceStore, (state) => state.query);
  const modelsQuery = useMarketplaceModels(appliedFilters);
  const downloadedModelsQuery = useDownloadedModels();
  const installStateByModelId = createMemo(() => {
    const installs = new Map<number, Record<string, unknown>>();
    for (const model of downloadedModelsQuery.data?.models ?? []) {
      installs.set((model as any).id, {
        status: (model as any).status,
        statusMessage: (model as any).statusMessage,
        buildTriggerId: (model as any).buildTriggerId,
        imageName: (model as any).imageName,
        runpodJobId: (model as any).runpodJobId,
      });
    }
    return installs;
  });

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
              setAppliedFilters({ ...storeState() });
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
            <Button type="button" variant={"outline"} size={"icon"} class="flex-shrink-0">
              <Funnel weight="bold" />
            </Button>
            <Button type="submit">Search</Button>
          </form>
        </nav>
      </header>
      <main>
        <ModelList query={modelsQuery} size="lg" installStateByModelId={installStateByModelId} />
      </main>
    </>
  );
}
