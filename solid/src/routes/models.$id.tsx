import {
  createFileRoute,
  useCanGoBack,
  useRouter,
} from "@tanstack/solid-router";
import { CaretLeft } from "phosphor-solid";
import { Match, Suspense, Switch } from "solid-js";
import { Loader } from "~/components/loader";
import { Button } from "~/components/ui/button";
import { useCivitaiModel } from "~/hooks/useCivitaiModel";

export const Route = createFileRoute("/models/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const civitaiModelQuery = useCivitaiModel(params);
  const civitaiModel = () => {
    if (!civitaiModelQuery.data) {
      return null;
    }
    if (!civitaiModelQuery.data?.model) {
      return undefined;
    }
    return civitaiModelQuery.data.model;
  };

  return (
    <Suspense fallback={<Loader />}>
      <Switch>
        <Match when={civitaiModel() === null}>
          <Loader />
        </Match>
        <Match when={civitaiModel()}>
          <header>
            <nav class="flex gap-2 justify-between p-2">
              <Button
                size={"icon"}
                variant={"outline"}
                onClick={() => {
                  canGoBack()
                    ? router.history.back()
                    : router.navigate({
                        to: "/marketplace",
                      });
                }}
              >
                <CaretLeft weight="bold" />
              </Button>
            </nav>
          </header>
          <main class="p-2 py-0">
            <h1 class="text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
              {civitaiModel()?.name}
            </h1>
            <p class="text-sm font-medium md:text-md lg:text-lg xl:text-xl">
              {civitaiModel()?.type}
            </p>
          </main>
        </Match>
      </Switch>
    </Suspense>
  );
}
