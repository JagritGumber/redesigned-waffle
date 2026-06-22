import { useMutation, useQueryClient } from "@tanstack/solid-query";
import axios from "axios";
import type { Accessor } from "solid-js";
import type { Model } from "~/types/civitai";

export const useDownloadModel = (
  params: Accessor<{ id: string; vId: string }>
) => {
  const queryClient = useQueryClient();

  return useMutation(() => ({
    mutationFn: async ({
      model,
      versionId,
      fileId,
      defaultDownload,
    }: {
      model: Model;
      versionId: number;
      fileId: number;
      defaultDownload: boolean;
    }) => {
      const response = await axios.post<{
        message: string;
        status: string;
        installStatus?: string | null;
        statusMessage?: string | null;
        buildTriggerId?: string | null;
        civitaiFileId?: number | null;
        runpodJobId?: string;
        imageName?: string | null;
        runpodPath?: string | null;
        downloadCompletedAt?: string | number | Date | null;
        buildTriggeredAt?: string | number | Date | null;
        deployedAt?: string | number | Date | null;
      }>(
        `${import.meta.env.VITE_BACKEND_URL}/api/v1/model`,
        {
          model,
          versionId,
          fileId,
          defaultDownload,
        },
        { withCredentials: true },
      );
      return response.data;
    },
    onSuccess: (data) => {
      console.log("Download initiation successful:", data);

      queryClient.invalidateQueries({
        queryKey: ["downloadedModel", String(params().vId)],
      });
      queryClient.invalidateQueries({
        queryKey: ["installedModel", String(params().id)],
      });
      queryClient.invalidateQueries({ queryKey: ["downloadedModels"] });
    },
    onError: (error) => {
      console.error("Download initiation failed:", error);

      queryClient.invalidateQueries({
        queryKey: ["downloadedModel", String(params().vId)],
      });
      queryClient.invalidateQueries({
        queryKey: ["installedModel", String(params().id)],
      });
      queryClient.invalidateQueries({ queryKey: ["downloadedModels"] });
    },
  }));
};
