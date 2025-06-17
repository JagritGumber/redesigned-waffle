// services/civitaiApi.ts (or wherever you define it)
import axios from "axios";
import type { Model } from "~/types/civitai"; // Ensure you have this type defined

// Define the structure returned by our fetch function for useInfiniteQuery
export interface FetchModelsPage {
  models: Model[];
  nextPageUrl: string | null | undefined; // URL for the next page, or null/undefined if none
}

// Base URL (without query params initially)
const CIVITAI_API_BASE_URL = "https://civitai.com/api/v1/models";

// Keep your filter param interface
export interface FetchModelsParams {
  query?: string;
  tag?: string;
  username?: string;
  types?: string[];
  sort?: string;
  // Add other base params like limit, nsfw, token etc.
  limit?: number;
  nsfw?: boolean;
  period?: string; // Example, if sort needs period
}

// This function now fetches a specific page based on the URL provided in pageParam
export const fetchCivitAIModelsPage = async ({
  pageParam, // This will be the URL to fetch
}: {
  pageParam?: string;
}): Promise<FetchModelsPage> => {
  const urlToFetch = pageParam || CIVITAI_API_BASE_URL;
  console.log("Fetching page:", urlToFetch); // Debugging

  try {
    // Directly use the URL passed as pageParam
    const response = await axios.get(urlToFetch);
    const data = response.data;

    return {
      models: data.items || [],
      nextPageUrl: data.metadata?.nextPage,
    };
  } catch (error) {
    console.error("Failed to fetch CivitAI models page:", error);
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", error.response?.data);
    }
    // Re-throw so React Query catches it and sets error state
    throw error;
  }
};

// Helper to construct the *initial* URL based on filters
export const buildInitialUrl = (baseParams: FetchModelsParams): string => {
  const urlParams = new URLSearchParams({
    token: import.meta.env.VITE_CIVITAI_API_TOKEN,
    nsfw: `${baseParams.nsfw ?? true}`,
  });

  if (baseParams.query) urlParams.set("query", baseParams.query);
  if (baseParams.tag) urlParams.set("tag", baseParams.tag);
  if (baseParams.username) urlParams.set("username", baseParams.username);
  if (baseParams.types && baseParams.types.length > 0)
    urlParams.set("types", baseParams.types.join(","));
  if (baseParams.sort) urlParams.set("sort", baseParams.sort);

  return `${CIVITAI_API_BASE_URL}?${urlParams.toString()}`;
};
