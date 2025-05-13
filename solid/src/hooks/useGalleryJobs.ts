// src/lib/queries/useGalleryJobs.ts
import { useQuery } from "@tanstack/solid-query";
import { getJobDetailsWithNeighbors } from "~/utils/getJobDetailsWithNeighbors";

const INITIAL_LOAD_LIMIT_BEFORE = 20;
const INITIAL_LOAD_LIMIT_AFTER = 20;

export function useGalleryJobs(initialJobId: string) {
  return useQuery(() => ({
    queryKey: [initialJobId, "galleryViewJob"],
    queryFn: () =>
      getJobDetailsWithNeighbors(initialJobId, {
        limitAfter: INITIAL_LOAD_LIMIT_AFTER,
        limitBefore: INITIAL_LOAD_LIMIT_BEFORE,
      }),
  }));
}
