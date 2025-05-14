import axios from "axios";
import type { CivitaiModelWithRelations } from "~/backend/schema/models";

interface DownloadedModelsResponse {
  models: CivitaiModelWithRelations[];
  message?: string; // Assuming a message field might exist
}

export const getAllDownloadedModels =
  async (): Promise<DownloadedModelsResponse> => {
    const response = await axios.get(
      `${import.meta.env.VITE_BACKEND_URL}/api/v1/model`, // Your backend endpoint for all models
    );
    if (response.status !== 200) {
      console.error("Failed to fetch all downloaded models:", response.status);
      throw new Error(
        `Failed to fetch all downloaded models: ${response.status}`,
      );
    }
    return response.data;
  };
