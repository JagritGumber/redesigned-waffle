// services/civitaiApi.ts (or wherever you define it)
import axios from 'axios';
import { Model } from '~/types/civitai'; // Ensure you have this type defined

// Define the structure returned by our fetch function for useInfiniteQuery
export interface FetchModelsPage {
  items: Model[];
  nextPageUrl: string | null | undefined; // URL for the next page, or null/undefined if none
}

// Base URL (without query params initially)
const CIVITAI_API_BASE_URL = 'https://civitai.com/api/v1/models';

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
  pageParam: string;
}): Promise<FetchModelsPage> => {
  console.log('Fetching page:', pageParam); // Debugging

  try {
    // Directly use the URL passed as pageParam
    const response = await axios.get(pageParam);
    const data = response.data;

    return {
      items: data.items || [],
      // IMPORTANT: Extract the nextPageUrl from metadata for useInfiniteQuery
      nextPageUrl: data.metadata?.nextPage,
    };
  } catch (error) {
    console.error('Failed to fetch CivitAI models page:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', error.response?.data);
    }
    // Re-throw so React Query catches it and sets error state
    throw error;
  }
};

// Helper to construct the *initial* URL based on filters
export const buildInitialUrl = (baseParams: FetchModelsParams): string => {
  const urlParams = new URLSearchParams({
    // Add default/base parameters here
    limit: (baseParams.limit || 20).toString(), // Default limit
    nsfw: (baseParams.nsfw ?? true).toString(), // Default nsfw
    // token: process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN || '', // Add token if needed
    page: '1', // Always start at page 1 for initial load
  });

  // Append token only if it exists
  const token = process.env.EXPO_PUBLIC_CIVITAI_API_TOKEN;
  if (token) {
    urlParams.set('token', token);
  }

  // Add dynamic filters/query
  if (baseParams.query) urlParams.set('query', baseParams.query);
  if (baseParams.tag) urlParams.set('tag', baseParams.tag);
  if (baseParams.username) urlParams.set('username', baseParams.username);
  if (baseParams.types && baseParams.types.length > 0)
    urlParams.set('types', baseParams.types.join(','));
  if (baseParams.sort) urlParams.set('sort', baseParams.sort);
  // Add other params like period if needed

  return `${CIVITAI_API_BASE_URL}?${urlParams.toString()}`;
};
