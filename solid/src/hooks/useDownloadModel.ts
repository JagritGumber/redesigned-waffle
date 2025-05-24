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
        runpodJobId?: string;
      }>(`${import.meta.env.VITE_BACKEND_URL}/api/v1/model`, {
        model,
        versionId,
        fileId,
        defaultDownload,
      });
      return response.data;
    },
    onSuccess: (data) => {
      console.log("Download initiation successful:", data);

      queryClient.invalidateQueries({
        queryKey: ["downloadedModel", String(params().vId)],
      });
    },
    onError: (error) => {
      console.error("Download initiation failed:", error);

      queryClient.invalidateQueries({
        queryKey: ["downloadedModel", String(params().vId)],
      });
    },
  }));
};
