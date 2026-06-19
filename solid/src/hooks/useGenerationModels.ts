import { useQuery } from "@tanstack/solid-query";
import axios from "axios";
import type { CivitaiModelWithRelations } from "~/backend/schema/models";

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
  }));
};

export default useGenerationModels;
