import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  Match,
  Switch,
  onCleanup,
  Show, // Make sure Show is imported if used
} from "solid-js";
import { Image } from "@unpic/solid";
import {
  Carousel,
  CarouselItem,
  CarouselContent,
  type CarouselApi,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel"; // Adjust import path if needed
import { Button } from "~/components/ui/button";
import { CaretLeft, CaretUp, Download, Trash } from "phosphor-solid";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer"; // Adjust import path if needed
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"; // Adjust import path if needed
import { Badge } from "~/components/ui/badge";
import { Loader } from "~/components/loader"; // Adjust import path if needed
import axios from "axios";
import useDownloadedModels from "~/hooks/useDownloadedModels"; // Adjust import path if needed
import useGeneratedJobs from "~/hooks/useGeneratedJobs"; // Adjust import path if needed
import type { GenerateRequestPayloadType } from "~/backend/validators/generation";

export const Route = createFileRoute("/gallery/$id")({
  // Consider adding loader/preload functions if needed, but handling loading inside
  // the component is also fine for this case.
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [api, setApi] = createSignal<ReturnType<CarouselApi>>();
  const [isHidden, setIsHidden] = createSignal(true);

  // The core synchronized state: the index of the currently displayed image
  const [carouselIndex, setCarouselIndex] = createSignal(0);

  // --- Data Fetching ---
  const modelsQuery = useDownloadedModels(); // Used in Drawer details
  const imageQuery = useGeneratedJobs(); // Fetches images with pagination

  // Memo to flatten the paginated image data into a single array
  const images = createMemo(() => {
    // Return an empty array while data is loading or not available
    if (imageQuery.isLoading || imageQuery.isPending || !imageQuery.data) {
      return [];
    }
    return (imageQuery.data.pages ?? [])
      .flatMap((page) => page.items)
      .map((image) => ({
        ...image,
        // Ensure URL is correctly constructed
        url: `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/${encodeURIComponent(image?.imageKey ?? "")}`,
      }));
  });

  // Memo to get the currently displayed image object based on carouselIndex
  const currentImage = createMemo(() => {
    const currentImages = images();
    const index = carouselIndex(); // Use the synchronized index

    if (
      currentImages.length > 0 &&
      index >= 0 && // Ensure index is valid
      index < currentImages.length
    ) {
      return currentImages[index];
    }
    return null;
  });

  // --- Effects for Synchronization and Pagination ---

  // Effect 1: Initialize carouselIndex from URL $id when data is ready
  // Also handles navigation via back/forward buttons or direct URL change
  createEffect(() => {
    const currentImages = images();
    const currentId = params().id; // The ID from the URL

    // Only run this effect if images are loaded and the current URL ID doesn't match
    // the ID of the image currently shown based on carouselIndex().
    // This check prevents unnecessary re-syncs if the URL is already correct.
    if (currentImages.length > 0 && currentImage()?.id !== currentId) {
      const index = currentImages.findIndex((img) => img.id === currentId);

      if (index !== -1) {
        // If the ID from the URL is found in the loaded images, update the carousel index
        console.log(
          `Route change detected ($id=${currentId}), found at index ${index}. Setting carousel index.`
        ); // Debug
        setCarouselIndex(index); // Update the signal that controls the carousel
      } else {
        // Handle case where the ID from the URL is NOT found in currently loaded pages.
        // This could mean the image is in a later page, or the ID is invalid.
        console.warn(
          `Image ID "${currentId}" from URL not found in loaded images.`
        ); // Debug
        // Option A: Try to fetch next pages until found (complex)
        // Option B: Default to index 0 and show a message (simpler for now)
        // Option C: Navigate back to the gallery list (if ID is likely invalid)
        // Let's default to 0 for now and log a warning. If needed, add logic to fetch more pages.
        if (!imageQuery.isFetching && imageQuery.hasNextPage) {
          // If not currently fetching and more pages exist, maybe trigger a fetch here?
          // Or rely on the pagination trigger effect to handle this if they scroll.
          // For simplicity, let's just set to 0 if not found *in loaded pages*.
          // A more advanced approach might require a separate query or logic.
          console.warn(
            `Defaulting to index 0 as ID "${currentId}" not found in loaded pages.`
          );
          setCarouselIndex(0);
        } else if (
          !imageQuery.isFetching &&
          !imageQuery.hasNextPage &&
          currentImages.length > 0
        ) {
          // If all pages loaded and ID still not found, default to 0
          console.warn(
            `Defaulting to index 0 as ID "${currentId}" not found after loading all pages.`
          );
          setCarouselIndex(0);
        } else if (
          !imageQuery.isLoading &&
          !imageQuery.isFetching &&
          currentImages.length === 0
        ) {
          // If no images at all, navigate away (handled by the Match condition later)
          console.warn("No images loaded at all.");
          // The <Match when={images().length === 0}> block will handle navigating away
        }
      }
    } else if (
      currentImages.length > 0 &&
      !currentImage() &&
      !imageQuery.isLoading &&
      !imageQuery.isFetching
    ) {
      // Edge case: images loaded, but currentImage() is null. This might happen
      // if initial index was set to 0 but images load later, or if the list shrinks.
      // Re-evaluate index based on params().id
      const index = currentImages.findIndex((img) => img.id === currentId);
      const newIndex = index === -1 ? 0 : index;
      if (carouselIndex() !== newIndex) {
        console.log(
          `Adjusting carousel index based on params.id after data load: ${newIndex}`
        );
        setCarouselIndex(newIndex);
      }
    }
  });

  // Effect 2: Programmatically scroll the carousel when carouselIndex signal changes
  createEffect(() => {
    const currentApi = api(); // Get the carousel API
    const targetIndex = carouselIndex(); // The desired index from our signal
    const totalImages = images().length; // Total images currently loaded

    // Only scroll if API is ready, images exist, index is valid,
    // AND the carousel's *actual* current index is different from our target index.
    // This prevents infinite loops caused by the API's select event updating carouselIndex.
    if (
      currentApi &&
      totalImages > 0 &&
      targetIndex >= 0 &&
      targetIndex < totalImages
    ) {
      // Embla Carousel API provides selectedScrollSnap() to get the current index
      if (currentApi.selectedScrollSnap() !== targetIndex) {
        console.log(`Scrolling carousel API to index ${targetIndex}`); // Debug
        currentApi.scrollTo(targetIndex);
      }
    }
  });

  // Effect 3: Update URL when carousel changes slides (using Embla's 'select' event)
  createEffect(() => {
    const currentApi = api();
    // Wait for the API to be available
    if (!currentApi) {
      return;
    }

    // Listener function for carousel slide changes
    const onSelect = (emblaApi: ReturnType<CarouselApi>) => {
      const newIndex = emblaApi?.selectedScrollSnap() ?? 0; // Get the new index from the carousel
      const newImage = images()[newIndex]; // Get the image object at the new index

      // Update our internal state signal *first*
      setCarouselIndex(newIndex);

      // If the new image exists and its ID is different from the current URL $id,
      // navigate to the new image's route.
      if (newImage && newImage.id !== params().id) {
        console.log(
          `Carousel slide changed to index ${newIndex}, ID ${newImage.id}. Updating route.`
        ); // Debug
        router.navigate({
          to: "/gallery/$id", // Use the route definition pattern
          params: { id: newImage.id }, // Pass the new image ID
          replace: true, // Use `replace` to avoid adding every swipe to browser history
        });
      }
    };

    // Attach the event listener
    currentApi.on("select", onSelect);

    // Cleanup the event listener when the effect is re-run or component unmounts
    onCleanup(() => {
      currentApi.off("select", onSelect); // Use `off` to remove the listener
    });
  });

  // Effect 4: Trigger pagination (fetch next page) when nearing the end of loaded images
  createEffect(() => {
    const currentImages = images(); // Current list of images
    const currentIdx = carouselIndex(); // Current position in the carousel
    const isLoadingMore = imageQuery.isFetchingNextPage; // Check if a fetch is already in progress
    const hasMore = imageQuery.hasNextPage; // Check if there are more pages available
    const totalImagesLoaded = currentImages.length; // Total images currently in the array

    // Define a threshold: trigger fetch when this many images are left until the end
    const threshold = 5; // Example: fetch when user is 5 images away from the last loaded image

    // Check if:
    // 1. We have loaded some images (`totalImagesLoaded > 0`).
    // 2. The user is currently viewing an image close to the end of the loaded list.
    // 3. There are more pages to fetch (`hasMore`).
    // 4. We are not already fetching the next page (`!isLoadingMore`).
    if (
      totalImagesLoaded > 0 &&
      currentIdx >= totalImagesLoaded - 1 - threshold &&
      hasMore &&
      !isLoadingMore
    ) {
      console.log(
        `Nearing end (index ${currentIdx} of ${totalImagesLoaded}), fetching next page...`
      ); // Debug
      imageQuery.fetchNextPage(); // Trigger the next page fetch
    }
  });

  // --- Other Logic ---

  // Function to download current image
  async function downloadCurrentImage() {
    const url = currentImage()?.url;
    if (!url) {
      console.warn("No image URL available to download.");
      return;
    }

    try {
      // Use a simple anchor tag for download
      const a = document.createElement("a");
      a.href = url;
      // Suggest a filename. You might want to extract a better name from image metadata.
      a.download = `image-${currentImage()?.id || "download"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download image:", error);
      // Potentially show a user-friendly error message
    }
  }

  // Mutation for deleting an image
  const deleteImageMutation = useMutation(() => ({
    // Mutation function: takes the image ID to delete
    mutationFn: async (id: string) => {
      try {
        // Use axios to make the DELETE request
        const response = await axios.delete(
          `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/${id}`
        );
        return response.data; // Return data if needed, or just null/void
      } catch (e) {
        console.error("Delete failed:", e);
        // Rethrow the error so TanStack Query can manage the error state
        throw new Error("Failed to delete image."); // Provide a user-friendly error message
      }
    },
    // onSuccess callback after successful deletion
    onSuccess: (_data, deletedId) => {
      console.log(`Image ${deletedId} deleted successfully.`); // Debug

      // Invalidate the query to refetch the list of images from the beginning
      // This is important because the total count and pagination might change.
      queryClient.invalidateQueries({
        queryKey: ["r2Images", undefined], // Assuming this is your query key
        // refetchType: 'all', // Optional: ensure all instances are refetched
      });

      // After invalidation, the `images()` memo will update eventually.
      // We need to decide where to navigate the user *now*.
      // Find the image that will be at the position of the deleted image, or the next available one.
      // This logic needs to run *before* the invalidated query potentially removes the image from `images()`.
      const currentImagesList = images(); // Get the list *before* refetch finishes
      const deletedIndex = carouselIndex(); // Get the index *before* deletion caused state changes

      let nextImageIdToNavigateTo: string | undefined;

      if (currentImagesList.length > 1) {
        nextImageIdToNavigateTo =
          deletedIndex < currentImagesList.length - 1
            ? currentImagesList[deletedIndex + 1]?.id // Image that was after
            : deletedIndex > 0
              ? currentImagesList[deletedIndex - 1]?.id
              : undefined; // Image that was before (if not the first)

        if (currentImagesList.length > 1) {
          const imageAfterDeleted = currentImagesList[deletedIndex + 1];
          const imageBeforeDeleted =
            deletedIndex > 0 ? currentImagesList[deletedIndex - 1] : undefined;

          if (imageAfterDeleted) {
            nextImageIdToNavigateTo = imageAfterDeleted.id;
          } else if (imageBeforeDeleted) {
            nextImageIdToNavigateTo = imageBeforeDeleted.id;
          } else {
            // Should not happen if length > 1, but as a fallback
            nextImageIdToNavigateTo = currentImagesList[0]?.id;
          }
        } else {
          // Only one image was left, or the list was already empty (shouldn't happen if currentImage is valid)
          nextImageIdToNavigateTo = undefined; // Indicates no images left
        }

        if (nextImageIdToNavigateTo) {
          console.log(
            `Navigating to next image ID: ${nextImageIdToNavigateTo}`
          ); // Debug
          // Navigate to the next image's route, replacing the current history entry
          router.navigate({
            to: "/gallery/$id",
            params: { id: nextImageIdToNavigateTo },
            replace: true,
          });
        } else {
          console.log("No images left, navigating back to gallery list."); // Debug
          // No images left, go back to the main gallery list page
          router.navigate({
            to: "/tabs/three", // Adjust this to your gallery list route
          });
        }
      }
    },
    // onError callback
    onError: (error) => {
      console.error("Error deleting image:", error); // Log the error
      // You might want to show a toast or other UI feedback to the user
      alert(`Failed to delete image: ${error.message}`); // Simple alert for demonstration
    },
  }));

  // --- UI Structure ---

  // Determine overall loading state for the main loader
  const isInitialLoading = () =>
    imageQuery.isLoading ||
    imageQuery.isPending ||
    (imageQuery.isSuccess && images().length > 0 && !currentImage());
  // Also consider if any images are being fetched (including next page)
  const isAnyFetching = () =>
    modelsQuery.isFetching || deleteImageMutation.isPending;

  const displayKeys: Array<keyof GenerateRequestPayloadType> = [
    "prompt",
    "steps",
    "seed",
    "width",
    "height",
    "checkpoint",
    "loras",
    "steps",
  ];

  return (
    <Switch fallback={<Loader />}>
      <Match when={isInitialLoading()}>
        <Loader />
      </Match>
      <Match when={imageQuery.isError}>
        <div class="flex flex-col items-center justify-center h-dvh text-center">
          <p class="text-xl mb-4 text-red-500">Error loading images.</p>

          <Button onClick={() => imageQuery.refetch()}>Retry Loading</Button>
          <Link to="/tabs/three" class="mt-2">
            <Button variant="secondary">Go back</Button>
          </Link>
        </div>
      </Match>
      <Match when={imageQuery.isSuccess && images().length === 0}>
        <div class="flex flex-col items-center justify-center h-dvh text-center">
          <p class="text-xl mb-4">No images found in the gallery.</p>
          <Link to="/tabs/three">
            <Button variant="secondary">Go to Gallery List</Button>
          </Link>
        </div>
      </Match>

      <Match
        when={imageQuery.isSuccess && images().length > 0 && currentImage()}
      >
        <Show when={!isHidden()}>
          <header>
            <nav class="absolute flex gap-2 justify-between w-full items-center p-2 z-20">
              <Link to="/tabs/three">
                <Button size={"icon"} variant={"secondary"}>
                  <CaretLeft weight="bold" />
                </Button>
              </Link>

              <Badge>
                {carouselIndex() + 1} / {images().length}
              </Badge>

              <div class="flex gap-2">
                <Button
                  onClick={downloadCurrentImage}
                  size={"icon"}
                  variant={"secondary"}
                  disabled={!currentImage() || isAnyFetching()} // Disable if no image or fetching/mutating
                >
                  <Download weight="bold" />
                </Button>

                <Button
                  onClick={() => {
                    const imgToDelete = currentImage();
                    if (imgToDelete) {
                      // Prompt user for confirmation before deleting
                      if (
                        confirm(
                          `Are you sure you want to delete image "${imgToDelete.id}"?`
                        )
                      ) {
                        deleteImageMutation.mutate(imgToDelete.id); // Pass only the ID
                      }
                    }
                  }}
                  size={"icon"}
                  variant={"destructive"}
                  disabled={deleteImageMutation.isPending || !currentImage()}
                >
                  <Trash weight="bold" />
                </Button>
              </div>
            </nav>
          </header>
        </Show>

        <main class="relative w-full h-dvh bg-black flex justify-center items-center">
          <Show when={isAnyFetching() && !deleteImageMutation.isPending}>
            <Loader />
          </Show>
          <Carousel
            opts={{
              loop: true,
              containScroll: "keepSnaps",
            }}
            setApi={setApi} // Get the API instance
            class="w-full h-dvh" // Ensure carousel takes full height/width
          >
            <CarouselContent class="-ml-1">
              <For each={images()}>
                {(image) => (
                  <CarouselItem
                    class="pl-1 h-dvh flex justify-center items-center relative"
                    onClick={() => {
                      setIsHidden((prev) => !prev);
                    }}
                  >
                    <div
                      style={{
                        "background-image": `url(${image.url || ""})`,
                        filter: "blur(50px)",
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        "background-size": "cover",
                        "background-position": "center",
                        "z-index": 5,
                      }}
                    ></div>
                    <Image
                      src={image.url || ""}
                      alt={`Gallery image ${image.id}`}
                      class={`max-w-full max-h-full object-contain relative z-10`}
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
                // Disable if API not ready or cannot scroll
                disabled={!api() || !api()?.canScrollPrev()}
              />
              <CarouselNext
                variant={"secondary"}
                class="z-20 absolute top-1/2 right-2 -translate-y-1/2"
                // Disable if API not ready or cannot scroll
                disabled={!api() || !api()?.canScrollNext()}
              />
            </Show>
          </Carousel>
          <Drawer>
            <DrawerTrigger class="absolute bottom-2 z-20 left-1/2 -translate-x-1/2">
              <Show when={!isHidden()}>
                <Button size={"icon"} variant={"secondary"}>
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

              <Show when={currentImage()?.inputPayload}>
                <Table class="w-full px-4 pb-4 text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-36 font-bold">Field</TableHead>
                      <TableHead class="font-bold">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <Index each={displayKeys}>
                      {(key) => {
                        const typedKey =
                          key() as keyof GenerateRequestPayloadType;
                        // Ensure generationInfo exists before accessing keys
                        const info = currentImage()
                          ?.inputPayload as GenerateRequestPayloadType;
                        const value = info?.[typedKey];

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

                        if (Array.isArray(value)) {
                          displayValueNode = value.join(", ");
                        } else if (typeof value === "boolean") {
                          displayValueNode = value ? "Yes" : "No";
                        } else if (typeof value === "object") {
                          // Fallback for other unexpected objects (excluding extra_generation_params handled above)
                          // Only stringify if it's a non-empty object
                          if (Object.keys(value).length > 0) {
                            displayValueNode = JSON.stringify(value);
                          } else {
                            return null; // Skip empty objects
                          }
                        } else {
                          displayValueNode = String(value); // Display other scalar values as string
                        }

                        // Only render the row if we have a value node to display
                        return displayValueNode !== undefined ? (
                          <TableRow>
                            <TableCell class="font-semibold w-24 align-top">
                              {displayKey}
                            </TableCell>
                            <TableCell class="text-wrap">
                              {displayValueNode as any}{" "}
                            </TableCell>
                          </TableRow>
                        ) : null;
                      }}
                    </Index>
                  </TableBody>
                </Table>
              </Show>

              <Show
                when={
                  !currentImage()?.generationInfo &&
                  !currentImage()?.inputPayload
                }
              >
                <div class="text-center text-muted-foreground py-8 px-4">
                  <p>
                    No detailed generation or input info available for this
                    image.
                  </p>
                </div>
              </Show>
            </DrawerContent>
          </Drawer>
        </main>
      </Match>
    </Switch>
  );
}
