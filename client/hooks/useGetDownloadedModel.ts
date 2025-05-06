// ./hooks.ts or ./queries.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { CivitaiModelWithRelations } from '~/backend/schema/models'; // Your backend DB model type

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

/**
 * Query hook to fetch a model from your backend database by its Civitai ID.
 * This will contain the downloadStatus and deletionStatus.
 */
export const useGetDownloadedModel = (civitaiId: string | number) => {
  // Define the query key based on the model ID
  const queryKey = ['downloadedModel', String(civitaiId)];

  // Query function to fetch data from your backend
  const queryFn = async () => {
    if (!civitaiId) return null; // Don't fetch if no ID
    try {
      const response = await axios.get<{ message: string; model: CivitaiModelWithRelations }>(
        `${BACKEND_URL}/api/v1/model/${civitaiId}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // If model is not found in our DB, return null or handle as needed
        // This could happen if the model hasn't been added for download yet.
        return null;
      }
      console.error(`Error fetching downloaded model ${civitaiId}:`, error);
      throw error; // Re-throw other errors
    }
  };

  // Use the query hook with dynamic refetchInterval
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn,
    enabled: !!civitaiId, // Only enable the query if civitaiId is available
    // Dynamic refetchInterval for polling
    refetchInterval: (query) => {
      const model = query.state.data?.model;
      if (!model) return false; // No data, no polling

      // Check primary file download status
      const latestVersion = model.modelVersions?.[0]; // Assuming latest is first due to backend sort
      const primaryFile = latestVersion?.files?.find((file) => file);
      const downloadStatus = primaryFile?.downloadStatus;

      // Check model deletion status
      const modelStatus = model.status; // Assuming model status exists

      // Poll if download is in progress OR deletion is pending/in progress
      if (downloadStatus === 'IN_PROGRESS' || modelStatus === 'PENDING_DELETE') {
        return 5000; // Poll every 5 seconds
      }

      return false; // No polling needed
    },
    // Optional: Set staleTime to 0 to always consider data stale and refetch in the background on mount/focus
    // staleTime: 0,
    // Optional: Keep previous data while fetching new data (useful for polling)
  });

  return { downloadedModel: data?.model, isLoading, error };
};
