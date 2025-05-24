import {
  createFileRoute,
  useCanGoBack,
  useRouter,
  Link,
} from "@tanstack/solid-router";
import { blurhashToCssGradientString } from "@unpic/placeholder";
import { Image } from "@unpic/solid";
import { CaretLeft, Download } from "phosphor-solid";
import { For, Match, Suspense, Switch } from "solid-js";
import { Loader } from "~/components/loader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "~/components/ui/carousel";
import { Separator } from "~/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  useCivitaiModel,
  useCivitaiModelVersion,
} from "~/hooks/useCivitaiModel";
import { useDownloadModel } from "~/hooks/useDownloadModel";
import { formatBytes } from "~/utils/formatBytes";
import { formatTime } from "~/utils/formatTime";

export const Route = createFileRoute("/models/$id/$vId")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const civitaiModelQuery = useCivitaiModel(params);
  const civitaiModelVersionQuery = useCivitaiModelVersion(params);
  const civitaiModel = () => {
    if (!civitaiModelQuery.data) {
      return null;
    }
    if (!civitaiModelQuery.data?.model) {
      return undefined;
    }
    return civitaiModelQuery.data.model;
  };

  const civitaiModelVersion = () => {
    if (!civitaiModelVersionQuery.data) {
      return null;
    }
    if (!civitaiModelVersionQuery.data?.modelVersion) {
      return undefined;
    }
    return civitaiModelVersionQuery.data?.modelVersion;
  };

  const primaryFile = () => {
    return (
      civitaiModelVersion()?.files.find((file) => file.primary) ??
      civitaiModelVersion()?.files.at(0)
    );
  };

  const downloadMutation = useDownloadModel(params);

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
          <main class="p-2 py-0 flex flex-col gap-2 mb-20">
            <h1 class="text-lg font-bold md:text-xl lg:text-2xl xl:text-3xl">
              {civitaiModel()?.name}
            </h1>
            <div class="flex gap-1 items-center flex-wrap ">
              <p class="text-xs font-medium lg:text-sm">
                Updated: {formatTime(civitaiModelVersion()?.updatedAt ?? "")}
              </p>
              <Separator orientation="vertical" />
              <For each={civitaiModel()?.tags}>
                {(tag, index) => (
                  <>
                    <Badge
                      class="text-xs lg:text-sm"
                      variant={index() === 0 ? "default" : "secondary"}
                    >
                      {tag.toUpperCase()}
                    </Badge>
                    <Separator orientation="vertical" />
                  </>
                )}
              </For>
            </div>
            <div class="overflow-auto flex  gap-2">
              <For each={civitaiModel()?.modelVersions}>
                {(version) => (
                  <Link
                    to="/models/$id/$vId"
                    params={{
                      id: params().id,
                      vId: version.id.toString(),
                    }}
                  >
                    <Button
                      size={"sm"}
                      variant={
                        civitaiModelVersion()?.name === version.name
                          ? "default"
                          : "secondary"
                      }
                    >
                      {version.name}
                    </Button>
                  </Link>
                )}
              </For>
            </div>
            <Carousel
              class=" max-w-full md:max-w-[66%] xl:max-w-[78%] select-none"
              opts={{ loop: true, align: "start" }}
            >
              <CarouselContent>
                <For each={civitaiModelVersion()?.images}>
                  {(image) => (
                    <CarouselItem class="items-center flex lg:basis-1/2 xl:basis-1/3">
                      <Image
                        class="w-full object-cover rounded-md"
                        src={image.url}
                        alt={image.meta.name ?? "No Name"}
                        layout="fullWidth"
                        background={blurhashToCssGradientString(image.hash)}
                        loading="lazy"
                      />
                    </CarouselItem>
                  )}
                </For>
              </CarouselContent>
            </Carousel>
            <Button
              class="w-full"
              onClick={() => {
                downloadMutation.mutate({
                  model: civitaiModel()!,
                  versionId: civitaiModelVersion()?.id!,
                  defaultDownload: true,
                  fileId: primaryFile()?.id!,
                });
              }}
            >
              <Download weight="bold" />
              Download ({formatBytes((primaryFile()?.sizeKB ?? 0) * 1024)})
            </Button>
            <Accordion multiple={false} collapsible>
              <AccordionItem value="details">
                <Table class="border-border border rounded-md">
                  <TableHeader>
                    <TableRow>
                      <TableHead colSpan={2}>
                        <AccordionTrigger class="p-0">Details</AccordionTrigger>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <AccordionContent class="w-full p-0 [&>div]:p-0">
                    <TableBody>
                      <TableRow>
                        <TableCell class="font-medium bg-secondary min-w-28">
                          Type
                        </TableCell>
                        <TableCell class="w-full">
                          {civitaiModel()?.type}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell class="font-medium bg-secondary min-w-28">
                          Published
                        </TableCell>
                        <TableCell class="w-full">
                          {formatTime(civitaiModelVersion()?.publishedAt ?? "")}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell class="font-medium bg-secondary min-w-28">
                          Base Model
                        </TableCell>
                        <TableCell class="w-full">
                          {civitaiModelVersion()?.baseModel}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell class="font-medium bg-secondary min-w-28">
                          Trigger Words
                        </TableCell>
                        <TableCell class="w-full">
                          <For each={civitaiModelVersion()?.trainedWords}>
                            {(word) => (
                              <span class="text-sm font-semibold">
                                {word.toUpperCase()}
                              </span>
                            )}
                          </For>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </AccordionContent>
                </Table>
              </AccordionItem>
            </Accordion>
            {/* Files Accordion */}
            <Accordion multiple={false} collapsible>
              <AccordionItem value="details">
                <div class="h-10 px-2 text-left align-middle border-border border flex items-center font-medium text-muted-foreground w-full [&>h3]:w-full">
                  <AccordionTrigger class="p-0">
                    {civitaiModelVersion()?.files.length}{" "}
                    {(civitaiModelVersion()?.files.length ?? 0) <= 1
                      ? "File"
                      : "Files"}
                  </AccordionTrigger>
                </div>
                <AccordionContent class="w-full p-0 [&>div]:p-0">
                  <For each={civitaiModelVersion()?.files}>
                    {(file) => (
                      <div class="flex flex-col p-2 w-full [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border border-l border-r ">
                        <div class="flex justify-between w-full items-center">
                          <span class="text-sm font-semibold">
                            {file.metadata.size === "full"
                              ? "Full Model"
                              : file.metadata.size}{" "}
                            {file.metadata.fp} (
                            {formatBytes((file.sizeKB ?? 0) * 1024)})
                          </span>
                          <Button
                            class="p-0 h-fit"
                            variant={"link"}
                            onClick={() => {
                              downloadMutation.mutate({
                                model: civitaiModel()!,
                                versionId: civitaiModelVersion()?.id!,
                                defaultDownload: true,
                                fileId: file.id!,
                              });
                            }}
                          >
                            Download
                          </Button>
                        </div>
                        <span>{file.metadata.format}</span>
                      </div>
                    )}
                  </For>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div
              innerHTML={
                civitaiModelVersion()?.description ??
                civitaiModel()?.description ??
                ""
              }
            ></div>
          </main>
        </Match>
      </Switch>
    </Suspense>
  );
}
