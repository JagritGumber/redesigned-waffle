// src/hooks/useDownloadedModels.ts
import { useQuery } from "@tanstack/solid-query";
import axios from "axios";
import type { CivitaiModelWithRelations } from "~/backend/schema/models"; // Assuming this is the type returned by the backend

// Define the expected structure of the successful response
interface DownloadedModelsResponse {
  models: CivitaiModelWithRelations[];
  message?: string; // Assuming a message field might exist
}

// Query function to fetch all downloaded models
const getAllDownloadedModels = async (): Promise<DownloadedModelsResponse> => {
  const response = await axios.get(
    `${import.meta.env.VITE_BACKEND_URL}/api/v1/model`, // Your backend endpoint for all models
    { withCredentials: true },
  );
  if (response.status !== 200) {
    console.error("Failed to fetch all downloaded models:", response.status);
    throw new Error(
      `Failed to fetch all downloaded models: ${response.status}`,
    );
  }
  return response.data;
};

// TanStack Query hook for all downloaded models
const useDownloadedModels = () => {
  return useQuery<DownloadedModelsResponse, Error>(() => ({
    queryKey: ["downloadedModels"], // Unique key for fetching all downloaded models
    queryFn: getAllDownloadedModels,
    refetchInterval: (query) => {
      const models = query.state.data?.models ?? [];
      const hasActiveInstall = models.some((model: any) =>
        ["REGISTERING", "DOWNLOADING", "BUILD_QUEUED", "BUILDING"].includes(model.status),
      );
      return hasActiveInstall ? 5000 : false;
    },
  }));
};

export default useDownloadedModels;
