import { requireUserId } from "@/utils/auth";
import Elysia, { t } from "elysia";

const CIVITAI_API_BASE_URL = "https://civitai.com/api/v1";

function withCivitaiToken(url: URL) {
  if (Bun.env.CIVITAI_API_TOKEN) {
    url.searchParams.set("token", Bun.env.CIVITAI_API_TOKEN);
  }

  return url;
}

async function fetchCivitaiJson(url: URL, set: any) {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    set.status = response.status;
    return {
      error: "Civitai request failed.",
      details: data ?? response.statusText,
    };
  }

  return data;
}

function toBackendNextPageUrl(civitaiNextPage: string | undefined, requestUrl: string) {
  if (!civitaiNextPage) return null;

  const nextUrl = new URL(civitaiNextPage);
  const backendUrl = new URL(requestUrl);
  backendUrl.search = nextUrl.search;

  return backendUrl.toString();
}

export const civitaiRouter = new Elysia({ prefix: "civitai" })
  .get(
    "/models",
    async ({ query, request, set }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { error: "Authentication required." };

      const url = withCivitaiToken(new URL(`${CIVITAI_API_BASE_URL}/models`));

      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }

      const data = await fetchCivitaiJson(url, set);
      if (data?.error) return data;

      return {
        models: data.items ?? [],
        nextPageUrl: toBackendNextPageUrl(data.metadata?.nextPage, request.url),
      };
    },
    {
      query: t.Object({
        query: t.Optional(t.String()),
        tag: t.Optional(t.String()),
        username: t.Optional(t.String()),
        types: t.Optional(t.String()),
        sort: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        period: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        nsfw: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/models/:id",
    async ({ params, request, set }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { error: "Authentication required." };

      const data = await fetchCivitaiJson(
        withCivitaiToken(new URL(`${CIVITAI_API_BASE_URL}/models/${params.id}`)),
        set,
      );
      if (data?.error) return data;

      return data;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  )
  .get(
    "/model-versions/:id",
    async ({ params, request, set }) => {
      const userId = await requireUserId(request, set as any);
      if (!userId) return { error: "Authentication required." };

      const data = await fetchCivitaiJson(
        withCivitaiToken(new URL(`${CIVITAI_API_BASE_URL}/model-versions/${params.id}`)),
        set,
      );
      if (data?.error) return data;

      return data;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );
