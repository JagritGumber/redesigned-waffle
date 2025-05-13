import { useQuery } from "@tanstack/solid-query";
import axios from "axios";
import type { Accessor } from "solid-js";
import type { Model } from "~/types/civitai";

const fetchCivitaiDetails = async (id: string) => {
  try {
    const apiUrl = `https://civitai.com/api/v1/models/${id}`;
    const response = await axios.get<Model>(apiUrl);
    const [latestVersion] = response.data.modelVersions.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    return { model: response.data, latestVersion };
  } catch (e: any) {
    console.error("Error fetching Civitai model details:", e);
    return null;
  }
};

export const useCivitaiModel = (params: Accessor<{ id: string }>) =>
  useQuery(() => ({
    queryFn: () => fetchCivitaiDetails(params().id),
    queryKey: ["civitaiModel", params().id],
  }));
