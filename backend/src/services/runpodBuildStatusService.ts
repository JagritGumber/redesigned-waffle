import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { civitaiModelInstalls } from "@/schema/modelInstall";
import { resolveModelImageWebhookState } from "@/services/modelImageStatusService";

const ACTIVE_BUILD_STATUSES = ["BUILD_QUEUED", "BUILDING"];

export type RunPodBuildPollingEnv = {
  RUNPOD_API_KEY?: string;
  RUNPOD_GENERATOR_ID?: string;
  MODEL_IMAGE_RUNPOD_BUILD_POLLING?: string;
};

type RunPodGitBuild = {
  id?: string | null;
  state?: string | null;
  imageName?: string | null;
  commitHash?: string | null;
  commitMessage?: string | null;
  branch?: string | null;
  error?: string | null;
  completedAt?: string | null;
};

type RunPodBuildQueryResponse = {
  data?: {
    myself?: {
      endpoints?: Array<{
        id?: string | null;
        builds?: RunPodGitBuild[] | null;
      }> | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export const RUNPOD_BUILDS_QUERY = `
  query ModelImageEndpointBuilds {
    myself {
      endpoints {
        id
        builds {
          id
          state
          imageName
          commitHash
          commitMessage
          branch
          error
          completedAt
        }
      }
    }
  }
`;

export function buildMatchesModel(build: RunPodGitBuild, buildTriggerId: string): boolean {
  const expectedTag = `model-${buildTriggerId}`;
  return [build.id, build.imageName].some((value) => value?.includes(expectedTag));
}

async function fetchRunPodBuilds(env: RunPodBuildPollingEnv): Promise<RunPodGitBuild[]> {
  if (!env.RUNPOD_API_KEY) {
    throw new Error("RUNPOD_API_KEY is required to poll RunPod build status.");
  }
  if (!env.RUNPOD_GENERATOR_ID) {
    throw new Error("RUNPOD_GENERATOR_ID is required to poll RunPod build status.");
  }

  const response = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({ query: RUNPOD_BUILDS_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`RunPod GraphQL request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as RunPodBuildQueryResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return (
    payload.data?.myself?.endpoints?.find((endpoint) => endpoint.id === env.RUNPOD_GENERATOR_ID)
      ?.builds ?? []
  );
}

export async function pollRunPodModelImageBuilds(
  db: DrizzleD1Database<any>,
  env: RunPodBuildPollingEnv,
) {
  const shouldPoll = env.MODEL_IMAGE_RUNPOD_BUILD_POLLING !== "false";
  if (!shouldPoll || !env.RUNPOD_GENERATOR_ID || !env.RUNPOD_API_KEY) {
    return { checked: 0, updated: 0, skipped: true };
  }

  const installs = await db
    .select()
    .from(civitaiModelInstalls)
    .where(
      and(
        inArray(civitaiModelInstalls.status, ACTIVE_BUILD_STATUSES),
        isNotNull(civitaiModelInstalls.buildTriggerId),
      ),
    );

  if (installs.length === 0) {
    return { checked: 0, updated: 0, skipped: false };
  }

  const builds = await fetchRunPodBuilds(env);
  let updated = 0;

  for (const install of installs) {
    if (!install.buildTriggerId) {
      continue;
    }

    const build = builds.find((candidate) =>
      buildMatchesModel(candidate, install.buildTriggerId as string),
    );

    if (!build?.state) {
      continue;
    }

    const webhookState = resolveModelImageWebhookState({
      status: build.state,
      now: build.completedAt ? new Date(build.completedAt) : undefined,
    });

    await db
      .update(civitaiModelInstalls)
      .set({
        status: webhookState.modelStatus,
        statusMessage: build.error ?? null,
        imageName: build.imageName ?? null,
        deployedAt: webhookState.deployedAt,
        updatedAt: new Date(),
      })
      .where(eq(civitaiModelInstalls.id, install.id));

    updated += 1;
  }

  return { checked: installs.length, updated, skipped: false };
}
