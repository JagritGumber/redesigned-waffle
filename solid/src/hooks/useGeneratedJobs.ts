import { useInfiniteQuery } from "@tanstack/solid-query";
import { createMemo, type Accessor } from "solid-js";
import type { SelectGeneratorJob } from "~/backend/schema";

export interface R2ListParams {
  query?: string;
  prefix?: string;
  limit?: number;
  status?:
    | "PENDING"
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "WEBHOOK_RECEIVED"
    | "CANCELLED"
    | Array<"PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "WEBHOOK_RECEIVED" | "CANCELLED">;
}

interface R2ListPage {
  items: SelectGeneratorJob[];
  nextContinuationToken: string | null;
}

interface BackendListPage {
  status: string;
  message: string;
  items: SelectGeneratorJob[];
  nextPageUrl: string | null;
}

const fetchR2ImagesPage = async ({
  pageParam,
  params,
}: {
  pageParam?: string | undefined;
  params?: R2ListParams;
}): Promise<R2ListPage> => {
  if (!import.meta.env.VITE_BACKEND_URL) {
    console.error("EXPO_PUBLIC_BACKEND_URL is not set.");
    throw new Error("Backend URL not configured.");
  }

  let fetchUrl: string;
  const defaultLimit = params?.limit || 50;

  if (pageParam) {
    fetchUrl = pageParam;
  } else {
    const url = new URL(`${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/images`);

    url.searchParams.set("limit", defaultLimit.toString());
    if (params?.query) {
      // Add search query parameter if present
      url.searchParams.set("query", params.query);
    }
    url.searchParams.set("offset", "0");
    if (params?.status) {
      if (Array.isArray(params.status)) {
        url.searchParams.set("status", params.status.join(","));
      } else {
        url.searchParams.set("status", params.status);
      }
    }
    console.log(url.searchParams);
    if (params?.prefix) {
      url.searchParams.set("prefix", params.prefix);
    }

    fetchUrl = url.toString();
  }

  try {
    const response = await fetch(fetchUrl, { credentials: "include" });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to fetch images: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const backendData: BackendListPage = await response.json();

    if (backendData.status === "error") {
      throw new Error(`Backend reported error: ${backendData.message}`);
    }
    return {
      items: backendData.items,
      nextContinuationToken: backendData.nextPageUrl,
    };
  } catch (error) {
    console.error("Error fetching images:", error);
    throw error;
  }
};

const useGeneratedJobs = (appliedFilters?: Accessor<R2ListParams>) => {
  const queryKey = createMemo(() => ["r2Images", appliedFilters?.()]);

  return useInfiniteQuery(() => ({
    queryKey: queryKey(),
    queryFn: ({ pageParam }) =>
      fetchR2ImagesPage({
        pageParam: pageParam,
        params: appliedFilters?.(),
      }),
    initialPageParam: `${import.meta.env.VITE_BACKEND_URL}/api/v1/generator/images`,
    getNextPageParam: (lastPage) => {
      return lastPage.nextContinuationToken;
    },
    refetchInterval: (query) => {
      const hasProcessingJobs = query.state.data?.pages.some((page) =>
        page.items.some((item) => item.status === "PENDING" || item.status === "RUNNING"),
      );
      return hasProcessingJobs ? 15 * 1000 : 15 * 60 * 1000; // 15 seconds or 15 minutes
    },
    gcTime: 1000 * 60 * 60,
  }));
};

export default useGeneratedJobs;
