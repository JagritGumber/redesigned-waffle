import { useQuery } from "@tanstack/solid-query";
import axios from "axios";
import type { CivitaiModelWithRelations } from "~/backend/schema/models";
import { isActiveModelInstall } from "~/components/model-install-status";

const getModels = async (
  type: string,
): Promise<{ models: CivitaiModelWithRelations[] }> => {
  try {
    const response = await axios.get<{ models: CivitaiModelWithRelations[] }>(
      `${import.meta.env.VITE_BACKEND_URL}/api/v1/model/${type.toLowerCase().replace(/ /g, "-")}`,
      { withCredentials: true },
    );
    if (response.status !== 200) {
      console.error(`Failed to fetch ${type}:`, response.status);
      throw new Error(`Failed to fetch ${type}: ${response.status}`); // Throw error to be handled by useQuery
    }
    return response.data;
  } catch (e) {
    throw new Error(JSON.stringify(e));
  }
};

// 2. Create a hook that uses useQuery
const useGenerationModels = (type: string) => {
  return useQuery<{ models: CivitaiModelWithRelations[] }, Error>(() => ({
    queryKey: ["models", type.toLowerCase().replace(/ /g, "-")],
    queryFn: async () => await getModels(type), // Call the fetch function
    refetchInterval: (query) => {
      const models = query.state.data?.models ?? [];
      const hasActiveInstall = models.some((model: any) => isActiveModelInstall(model.status));
      return hasActiveInstall ? 5000 : false;
    },
  }));
};

export default useGenerationModels;
