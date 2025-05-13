import { useMutation } from "@tanstack/solid-query";
import { createFileRoute, Link } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  Match,
  Switch,
} from "solid-js";
import { Image } from "@unpic/solid";
import {
  Carousel,
  CarouselItem,
  CarouselContent,
  type CarouselApi,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";
import { Button } from "~/components/ui/button";
import { CaretLeft, CaretUp, Download, Trash } from "phosphor-solid";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import type { InfoParsedResult } from "~/backend/types/generator";
import { Loader } from "~/components/loader";
import axios from "axios";
import useDownloadedModels from "~/hooks/useDownloadedModels";
import useGeneratedJobs from "~/hooks/useGeneratedJobs";
import { Show } from "solid-js";

export const Route = createFileRoute("/gallery/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const id = () => params().id;

  const [api, setApi] = createSignal<ReturnType<CarouselApi>>();
  const [isHidden, setIsHidden] = createSignal(true);

  createEffect(() => {
    if (!api()) {
      return;
    }

    api()?.on("select", (e) => {
      setCurrentIndex(e.selectedScrollSnap());
    });
  });

  createEffect(() => {
    console.log(api()?.slidesInView());
  });

  const modelsQuery = useDownloadedModels();

  const imageQuery = useGeneratedJobs();

  const images = () => {
    return (imageQuery?.data?.pages ?? [])
      .flatMap((page) => page.items)
      .map((image) => ({
        ...image,
        url: `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/${encodeURIComponent(image?.imageKey ?? "")}`,
      }));
  };

  const deleteImageMutation = useMutation(() => ({
    mutationFn: async (id: string) => {
      try {
        return axios.delete(
          `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/${id}`
        );
      } catch (e) {
        console.error(e);
        return null;
      }
    },
  }));

  const getStartIndex = () => {
    if (!images() || imageQuery.isLoading) {
      return 0;
    }
    const index = images().findIndex((img) => img.id === params().id);
    return index === -1 ? 0 : index;
  };

  const [currentIndex, setCurrentIndex] = createSignal<number>(getStartIndex());
  // Current image URL
  const currentImage = createMemo(() => {
    const currentImages = images();
    const index = currentIndex();

    if (
      currentImages.length > 0 &&
      index !== null &&
      index < currentImages.length
    ) {
      console.log(currentImages[index]);
      return currentImages[index];
    }
    return null;
  });

  // Function to download current image
  async function downloadCurrentImage() {
    const url = currentImage()?.url;
    if (!url) return;

    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `image-${currentImage()?.id || "download"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download image:", error);
    } finally {
    }
  }

  const displayKeys: Array<keyof InfoParsedResult> = [
    "prompt",
    "negative_prompt",
    "sd_model_name",
    "sd_vae_name",
    "sampler_name",
    "steps",
    "cfg_scale",
    "seed",
    "width",
    "height",
    "clip_skip",
    "batch_size",
    "denoising_strength",
    "restore_faces",
    "face_restoration_model",
    "styles",
    "job_timestamp",
    "extra_generation_params",
  ];

  const displayParamKeys: Array<string> = ["override_settings"];

  return (
    <Switch>
      <Match when={imageQuery.isLoading || !images()}>
        <Loader />
      </Match>
      <Match when={!imageQuery.isLoading}>
        <Show when={!isHidden()}>
          <header>
            <nav class="absolute flex gap-2 justify-between w-full items-center p-2 z-20">
              <Link to="/tabs/three">
                <Button size={"icon"} variant={"secondary"}>
                  <CaretLeft weight="bold" />
                </Button>
              </Link>
              <Badge>
                {currentIndex() + 1} / {images().length}
              </Badge>
              <div class="flex gap-2">
                <Button
                  onClick={downloadCurrentImage}
                  size={"icon"}
                  variant={"secondary"}
                >
                  <Download weight="bold" />
                </Button>
                <Button
                  onClick={() => deleteImageMutation.mutateAsync(id())}
                  size={"icon"}
                  variant={"destructive"}
                >
                  <Trash weight="bold" />
                </Button>
              </div>
            </nav>
          </header>
        </Show>
        <main class="relative w-full h-svh">
          <Carousel
            opts={{
              loop: true,
              containScroll: "keepSnaps",
              startIndex: getStartIndex(),
            }}
            setApi={setApi}
          >
            <CarouselContent>
              <For each={images()}>
                {(image) => (
                  <CarouselItem
                    style={{
                      "background-image": `url(${image.url})`,
                    }}
                    class={`bg-cover bg-center contain-paint`}
                    onClick={() => {
                      setIsHidden((prev) => !prev);
                    }}
                  >
                    <Image
                      src={image.url || ""}
                      alt="Current image"
                      class={`w-full h-svh object-contain z-10 top-0 left-0 backdrop-blur-xl`}
                      layout="fullWidth"
                    />
                  </CarouselItem>
                )}
              </For>
            </CarouselContent>
            <Show when={!isHidden()}>
              <CarouselPrevious
                variant={"secondary"}
                class="z-20 absolute top-1/2 left-2 -translate-y-1/2"
              />
              <CarouselNext
                variant={"secondary"}
                class="z-20 absolute top-1/2 right-2 -translate-y-1/2"
              />
            </Show>
          </Carousel>
          <Drawer>
            <DrawerTrigger class="absolute bottom-2 z-20 left-1/2 -translate-x-1/2">
              <Show when={!isHidden()}>
                <Button size={"icon"}>
                  <CaretUp weight="bold" />
                </Button>
              </Show>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Image Details</DrawerTitle>
                <DrawerDescription>
                  Things used to build this image
                </DrawerDescription>
              </DrawerHeader>
              {currentImage()?.generationInfo ? (
                <Table class="w-full px-4 pb-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-36 font-bold">Field</TableHead>
                      <TableHead class="font-bold">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <Index each={displayKeys}>
                      {(key) => {
                        const typedKey = key() as keyof InfoParsedResult;
                        const info = currentImage()
                          ?.generationInfo as InfoParsedResult;
                        const value = info?.[typedKey];
                        // Skip if value is null, empty string, empty array, or empty object (unless extra_generation_params)
                        if (
                          value == null ||
                          value === "" ||
                          (Array.isArray(value) && value.length === 0) ||
                          (typeof value === "object" &&
                            !(typedKey === "extra_generation_params") &&
                            Object.keys(value).length === 0)
                        ) {
                          return null; // Skip rendering this row
                        }

                        // Format the key string
                        const displayKey = String(key()) // Access the value of the signal from Index
                          .replace(/([a-z])([A-Z])/g, "$1 $2")
                          .replace(/_/g, " ")
                          .trim()
                          .split(" ")
                          .map(
                            (word) =>
                              word.charAt(0).toUpperCase() + word.slice(1)
                          )
                          .join(" ");

                        let displayValueNode;

                        if (
                          typedKey === "extra_generation_params" &&
                          typeof value === "object"
                        ) {
                          // Special formatting for JSON object
                          const jsonString = JSON.stringify(value, null, 2);
                          displayValueNode = (
                            <pre class="whitespace-pre-wrap break-all text-xs text-wrap bg-gray-800 text-white p-2 rounded-md overflow-auto max-h-40">
                              {jsonString}
                            </pre>
                          );
                        } else if (Array.isArray(value)) {
                          displayValueNode = value.join(", ");
                        } else if (typeof value === "boolean") {
                          displayValueNode = value ? "Yes" : "No";
                        } else if (typedKey === "job_timestamp") {
                          try {
                            const date = new Date(value as number);
                            const formattedDate = date.toLocaleString();
                            displayValueNode =
                              formattedDate === "Invalid Date"
                                ? value
                                : formattedDate;
                          } catch (e) {
                            displayValueNode = value;
                          }
                        } else if (typeof value === "object") {
                          // Fallback for other unexpected objects
                          displayValueNode = JSON.stringify(value);
                        } else {
                          displayValueNode = String(value);
                        }

                        return (
                          <TableRow>
                            <TableCell class="font-semibold w-24 align-top">
                              {displayKey}
                            </TableCell>

                            <TableCell class="text-wrap">
                              {displayValueNode as any}
                            </TableCell>
                          </TableRow>
                        );
                      }}
                    </Index>
                    <Index each={displayParamKeys}>
                      {(item) => {
                        const data = JSON.parse(
                          currentImage()?.inputPayload ?? "{}"
                        );
                        let displayKey = item();
                        let displayNode: string | undefined;

                        if (displayKey === "override_settings") {
                          displayNode = data[displayKey]["sd_model_checkpoint"];
                          displayNode = modelsQuery.data?.models.find(
                            (model) =>
                              model.modelVersions?.find(
                                (modelVersion) =>
                                  modelVersion.files?.find(
                                    (file) => file.runpodPath === displayNode
                                  ) !== undefined
                              ) !== undefined
                          )?.name;
                        }

                        return (
                          <TableRow>
                            <TableCell class="font-semibold w-24 align-top">
                              {item()}
                            </TableCell>

                            <TableCell class="text-wrap">
                              {displayNode}
                            </TableCell>
                          </TableRow>
                        );
                      }}
                    </Index>
                  </TableBody>
                </Table>
              ) : (
                // Message if no details are available
                <div class="text-center text-muted-foreground py-8 px-4">
                  <p>No detailed generation info available for this image.</p>
                </div>
              )}
            </DrawerContent>
          </Drawer>
        </main>
      </Match>
    </Switch>
  );
}
