import { useQuery } from "@tanstack/solid-query";
import axios from "axios";
import type { Accessor } from "solid-js";
import { isActiveModelInstall } from "~/components/model-install-status";

type InstalledModelResponse = {
  model?: {
    id: number;
    status?: string | null;
    statusMessage?: string | null;
    buildTriggerId?: string | null;
    runpodJobId?: string | null;
    civitaiFileId?: number | null;
    runpodPath?: string | null;
    downloadCompletedAt?: string | number | Date | null;
    buildTriggeredAt?: string | number | Date | null;
    deployedAt?: string | number | Date | null;
  };
  message?: string;
};

async function fetchInstalledModel(modelId: string): Promise<InstalledModelResponse | null> {
  try {
    const response = await axios.get<InstalledModelResponse>(
      `${import.meta.env.VITE_BACKEND_URL}/api/v1/model/${modelId}`,
      { withCredentials: true },
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export function useInstalledModel(params: Accessor<{ id: string; vId: string }>) {
  return useQuery<InstalledModelResponse | null, Error>(() => ({
    queryKey: ["installedModel", params().id],
    queryFn: () => fetchInstalledModel(params().id),
    refetchInterval: (query) => {
      const status = query.state.data?.model?.status;
      return isActiveModelInstall(status) ? 5000 : false;
    },
  }));
}
