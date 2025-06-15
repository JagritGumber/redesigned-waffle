import { createFileRoute } from "@tanstack/solid-router";
import { createEffect, createMemo } from "solid-js";
import { ImageList } from "~/components/image-list";
import useGeneratedJobs, { type R2ListParams } from "~/hooks/useGeneratedJobs";
import type { SelectGeneratorJob } from "~/backend/schema"; // Import SelectGeneratorJob

export const Route = createFileRoute("/tabs/three")({
  component: RouteComponent,
});

function RouteComponent() {
  const filters = createMemo<R2ListParams>(() => ({
    status: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "WEBHOOK_RECEIVED", "CANCELLED"],
  }));

  const allImagesQuery = useGeneratedJobs(filters);

  const combinedItems = createMemo(() => {
    const items = allImagesQuery.data?.pages?.flatMap((page) => page.items) || [];

    const allItemsWithProcessingFlag: (SelectGeneratorJob & { isProcessing?: boolean })[] =
      items.map((item) => ({
        ...item,
        isProcessing:
          item.status === "PENDING" ||
          item.status === "RUNNING" ||
          item.status === "WEBHOOK_RECEIVED",
      }));

    // Deduplicate allItems by id (still needed if backend sends duplicates across pages or refetches)
    const uniqueItems = Array.from(
      new Map(allItemsWithProcessingFlag.map((item) => [item.id, item])).values(),
    );

    // Sort by createdAt, with processing items first
    uniqueItems.sort((a, b) => {
      if (a.isProcessing && !b.isProcessing) return -1;
      if (!a.isProcessing && b.isProcessing) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return uniqueItems;
  });

  createEffect(() => {
    console.log("Combined and Deduplicated Items:", combinedItems());
  });

  return (
    <>
      <main>
        <ImageList
          items={combinedItems} // Pass the accessor directly
          query={allImagesQuery} // Pass the entire query object
          size="lg"
        />
      </main>
    </>
  );
}
