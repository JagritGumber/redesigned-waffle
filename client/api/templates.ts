// src/api/templates.ts

import { SelectGeneratorJob, SelectPostTemplate } from '~/backend/schema';

interface ApiSuccessResponse<T> {
  status: 'success';
  message: string;
  items?: T[]; // For list endpoint
  item?: T; // For single item endpoint
}

interface ApiErrorResponse {
  status: 'error';
  message: string;
  error?: string;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

type PostType = 'text' | 'poll';

interface TemplatePayload {
  name: string;
  type: PostType;
  title: string;
  description?: string;
  options?: string[];
  imageKeys?: string[]; // <<< Added: Image keys in payload
}

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!API_BASE_URL) {
  console.error('EXPO_PUBLIC_BACKEND_URL is not set.');
  // In a real app, you might throw here or handle gracefully
}

const TEMPLATES_API_URL = `${API_BASE_URL}/api/v1/post-templates`; // Adjust if your routes differ
const IMAGE_API_URL = `${API_BASE_URL}/api/v1/generator/images`; // Your images route

const authFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, credentials: 'include' });

const handleApiResponse = async <T>(response: Response): Promise<T | T[] | void> => {
  const data: ApiResponse<T> = await response.json();

  if (!response.ok || data.status === 'error') {
    const errorMessage = data.status === 'error' ? data.message : response.statusText;
    console.error('API Error:', data.error || errorMessage);
    throw new Error(data.message || 'An API error occurred');
  }

  if ('items' in data && Array.isArray(data.items)) {
    return data.items as T[];
  }
  if ('item' in data && data.item !== undefined) {
    return data.item as T;
  }

  // For operations like delete/update that might return success without item/items
  return; // Indicate success, actual return type is void
};

// --- API Functions ---

export const fetchTemplates = async (): Promise<SelectPostTemplate[]> => {
  const response = await authFetch(TEMPLATES_API_URL);
  return handleApiResponse<SelectPostTemplate>(response) as Promise<SelectPostTemplate[]>;
};

export const fetchTemplateById = async (id: string): Promise<SelectPostTemplate> => {
  const response = await authFetch(`${TEMPLATES_API_URL}/${id}`);
  return handleApiResponse<SelectPostTemplate>(response) as Promise<SelectPostTemplate>;
};

export const createTemplate = async (
  templateData: TemplatePayload
): Promise<SelectPostTemplate> => {
  const response = await authFetch(TEMPLATES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(templateData),
  });
  return handleApiResponse<SelectPostTemplate>(response) as Promise<SelectPostTemplate>;
};

export const updateTemplate = async (id: string, templateData: TemplatePayload): Promise<void> => {
  // Using PUT here to replace the whole template state as discussed
  const response = await authFetch(`${TEMPLATES_API_URL}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(templateData),
  });
  await handleApiResponse<void>(response); // We don't necessarily need the return value here
};

// Added PATCH function for potential future use or alternative updates
export const patchTemplate = async (
  id: string,
  templateData: Partial<TemplatePayload>
): Promise<void> => {
  const response = await authFetch(`${TEMPLATES_API_URL}/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(templateData),
  });
  await handleApiResponse<void>(response);
};

export const deleteTemplate = async (id: string): Promise<void> => {
  const response = await authFetch(`${TEMPLATES_API_URL}/${id}`, {
    method: 'DELETE',
  });
  await handleApiResponse<void>(response); // Delete might return success without a body
};

// Placeholder for actual posting logic
export const postToPlatform = async (
  platform: 'patreon' | 'deviantart',
  postData: TemplatePayload
): Promise<void> => {
  console.log(`API: Attempting to post to ${platform}`, postData);
  // Simulate network delay and success/failure
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() > 0.1) {
        // 90% chance of success
        console.log(`API: Simulated successful post to ${platform}`);
        resolve();
      } else {
        // 10% chance of failure
        console.error(`API: Simulated failed post to ${platform}`);
        reject(new Error(`Simulated error posting to ${platform}`));
      }
    }, 1500); // Simulate delay
  });
};

// --- Image Fetching Logic (from your example, integrated into API service) ---

interface R2ListParams {
  query?: string;
  prefix?: string;
  limit?: number;
}

interface R2ListPage {
  items: SelectGeneratorJob[];
  nextContinuationToken: string | null; // This is expected to be the nextPageUrl
}

interface BackendListPage {
  // The structure from your backend API
  status: string;
  message: string;
  items: SelectGeneratorJob[];
  nextPageUrl: string | null;
}

export const fetchR2ImagesPage = async ({
  pageParam,
  params,
}: {
  pageParam?: string | undefined;
  params: R2ListParams;
}): Promise<R2ListPage> => {
  if (!API_BASE_URL) {
    console.error('EXPO_PUBLIC_BACKEND_URL is not set.');
    throw new Error('Backend URL not configured.');
  }

  let fetchUrl: string;
  const defaultLimit = params.limit || 50;

  if (pageParam) {
    fetchUrl = pageParam; // Use the provided next URL
  } else {
    const url = new URL(IMAGE_API_URL); // Use the base images API URL

    url.searchParams.set('limit', defaultLimit.toString());
    if (params.query) {
      url.searchParams.set('query', params.query);
    }
    if (params.prefix) {
      url.searchParams.set('prefix', params.prefix);
    }

    fetchUrl = url.toString();
  }

  try {
    const response = await authFetch(fetchUrl);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to fetch images: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    const backendData: BackendListPage = await response.json();

    if (backendData.status === 'error') {
      throw new Error(`Backend reported error: ${backendData.message}`);
    }

    // Map backend structure to R2ListPage structure for react-query
    return {
      items: backendData.items,
      nextContinuationToken: backendData.nextPageUrl, // This is the URL for the next page
    };
  } catch (error) {
    console.error('Error fetching images page:', error);
    throw error; // Re-throw to be caught by react-query
  }
};

// We won't export the hook itself here, the component using it will set it up.
// Export necessary types for the hook setup in the component.
export type { R2ListParams, R2ListPage, SelectGeneratorJob, BackendListPage, TemplatePayload };
