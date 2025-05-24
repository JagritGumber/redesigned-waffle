import { BASE_URL } from "@/constants/main";
import { createAlova } from "alova";
import adapterFetch from "alova/fetch";

export const mainAlova = createAlova({
  baseURL: BASE_URL,
  requestAdapter: adapterFetch(),
  responded: (response) => response.json(),
});
