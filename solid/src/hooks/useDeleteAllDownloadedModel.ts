import { useMutation, useQueryClient } from "@tanstack/solid-query";
import axios from "axios";

const handleDeleteAll = async () => {
  try {
    const res = await axios.delete(
      `${import.meta.env.VITE_BACKEND_URL}/api/v1/model?confirm=true`
    );
    console.log(res);
  } catch (e) {
    console.error(e);
  }
};

const useDeleteAllDownloadedModels = () => {
  const queryClient = useQueryClient();

  return useMutation(() => ({
    mutationFn: handleDeleteAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloadedModels"] });
    },
  }));
};

export default useDeleteAllDownloadedModels;
