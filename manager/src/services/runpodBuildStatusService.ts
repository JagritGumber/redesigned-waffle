import { and, eq, inArray, isNotNull } from "drizzle-orm";
import db from "@/db";
import { civitaiModelInstalls } from "@/schema";
import { resolveModelImageWebhookState } from "@/services/modelImageStatusService";

const ACTIVE_BUILD_STATUSES = ["BUILD_QUEUED", "BUILDING"];

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
      endpoint?: {
        builds?: RunPodGitBuild[] | null;
      } | null;
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

export function buildMatchesInstall(
  build: RunPodGitBuild,
  install: {
    buildTriggerId: string;
    civitaiModelId?: number | null;
    civitaiFileId?: number | null;
  },
): boolean {
  const buildTriggerId = install.buildTriggerId;
  const expectedTag = `model-${buildTriggerId}`;
  const migrationId =
    install.civitaiModelId && install.civitaiFileId
      ? `civitai-${install.civitaiModelId}-${install.civitaiFileId}`
      : null;

  return (
    [build.id, build.imageName].some((value) => value?.includes(expectedTag)) ||
    Boolean(migrationId && build.commitMessage?.includes(`Add model migration ${migrationId}`))
  );
}

async function fetchRunPodBuilds(endpointId: string): Promise<RunPodGitBuild[]> {
  const apiKey = Bun.env.RUNPOD_API_KEY;
  if (!apiKey) {
    throw new Error("RUNPOD_API_KEY is required to poll RunPod build status.");
  }

  const response = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: RUNPOD_BUILDS_QUERY,
    }),
  });

  if (!response.ok) {
    throw new Error(`RunPod GraphQL request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as RunPodBuildQueryResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return (
    payload.data?.myself?.endpoints?.find((endpoint) => endpoint.id === endpointId)?.builds ?? []
  );
}

export async function pollRunPodModelImageBuilds() {
  const endpointId = Bun.env.RUNPOD_GENERATOR_ID;
  const shouldPoll = Bun.env.MODEL_IMAGE_RUNPOD_BUILD_POLLING !== "false";

  if (!shouldPoll || !endpointId || !Bun.env.RUNPOD_API_KEY) {
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

  const builds = await fetchRunPodBuilds(endpointId);
  let updated = 0;

  for (const install of installs) {
    if (!install.buildTriggerId) {
      continue;
    }

    const build = builds.find((candidate) =>
      buildMatchesInstall(candidate, {
        buildTriggerId: install.buildTriggerId as string,
        civitaiModelId: install.civitaiModelId,
        civitaiFileId: install.civitaiFileId,
      }),
    );

    if (!build?.state) {
      continue;
    }

    const webhookState = resolveModelImageWebhookState({
      status: build.state,
      image: build.imageName,
      message: build.error || undefined,
      now: build.completedAt ? new Date(build.completedAt) : undefined,
    });

    await db
      .update(civitaiModelInstalls)
      .set({
        status: webhookState.installStatus,
        statusMessage: webhookState.statusMessage,
        deployedAt: webhookState.deployedAt,
        updatedAt: new Date(),
      })
      .where(eq(civitaiModelInstalls.id, install.id));

    updated += 1;
  }

  return { checked: installs.length, updated, skipped: false };
}
