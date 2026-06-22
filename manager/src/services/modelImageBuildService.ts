import { existsSync } from "node:fs";
import { join } from "node:path";

type TriggerModelImageBuildInput = {
  civitaiModelId: number;
  civitaiFileId?: number | null;
  downloadUrl?: string | null;
  runpodPath?: string | null;
  runpodJobId?: string | null;
};

type TriggerModelImageBuildResult =
  | {
      triggered: true;
      buildTriggerId: string | null;
      message: string;
    }
  | {
      triggered: false;
      buildTriggerId: null;
      message: string;
    };

export async function triggerModelImageBuild(
  input: TriggerModelImageBuildInput,
): Promise<TriggerModelImageBuildResult> {
  if (!input.civitaiFileId) {
    throw new Error("Cannot trigger model image rebuild without a Civitai file ID.");
  }
  if (!input.downloadUrl) {
    throw new Error("Cannot trigger model image rebuild without a model download URL.");
  }
  if (!input.runpodPath) {
    throw new Error("Cannot trigger model image rebuild without a target model path.");
  }

  const buildTriggerId = crypto.randomUUID();
  const body = {
    event: "model.downloaded",
    buildTriggerId,
    civitaiModelId: input.civitaiModelId,
    civitaiFileId: input.civitaiFileId,
    downloadUrl: input.downloadUrl,
    runpodPath: input.runpodPath,
    runpodJobId: input.runpodJobId,
    cacheKey: `civitai-${input.civitaiModelId}-${input.civitaiFileId ?? "unknown"}`,
    migration: {
      id: `civitai-${input.civitaiModelId}-${input.civitaiFileId ?? "unknown"}`,
      url: input.downloadUrl,
      path: input.runpodPath,
    },
  };

  if (Bun.env.MODEL_IMAGE_REBUILD_PROVIDER === "mirror") {
    await commitMigrationToPrivateMirror(body.migration, buildTriggerId);

    return {
      triggered: true,
      buildTriggerId,
      message: "Private mirror model migration committed. RunPod will build from the mirror push.",
    };
  }

  return {
    triggered: false,
    buildTriggerId: null,
    message:
      "Model downloaded. MODEL_IMAGE_REBUILD_PROVIDER is not set to mirror, so image rebuild was not triggered.",
  };
}

async function commitMigrationToPrivateMirror(
  migration: { id: string; url: string; path: string },
  buildTriggerId: string,
) {
  const mirrorPath = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PATH;
  if (!mirrorPath) {
    throw new Error("MODEL_IMAGE_REBUILD_PROVIDER=mirror requires MODEL_IMAGE_REBUILD_MIRROR_PATH.");
  }
  if (!existsSync(join(mirrorPath, ".git"))) {
    throw new Error(`MODEL_IMAGE_REBUILD_MIRROR_PATH is not a git repository: ${mirrorPath}`);
  }

  await runCommand(
    [
      Bun.env.PYTHON_BIN ?? "python",
      join(import.meta.dir, "../../../generator/scripts/add_model_migration.py"),
      "--id",
      migration.id,
      "--url",
      migration.url,
      "--path",
      migration.path,
    ],
    process.cwd(),
    { GENERATOR_MIGRATION_ROOT: mirrorPath },
  );
  await runCommand(
    [
      Bun.env.PYTHON_BIN ?? "python",
      join(import.meta.dir, "../../../generator/scripts/render_model_dockerfile.py"),
    ],
    process.cwd(),
    { GENERATOR_MIGRATION_ROOT: mirrorPath },
  );

  const status = await runCommand(
    ["git", "status", "--porcelain", "--", "generator/model-migrations", "generator/Dockerfile"],
    mirrorPath,
  );
  if (!status.stdout.trim()) {
    return;
  }

  await runCommand(["git", "add", "generator/model-migrations", "generator/Dockerfile"], mirrorPath);
  await runCommand(["git", "commit", "-m", `Add model migration ${migration.id}`, "-m", `Build trigger: ${buildTriggerId}`], mirrorPath);

  if (Bun.env.MODEL_IMAGE_REBUILD_MIRROR_PUSH === "false") {
    return;
  }

  const remote = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_REMOTE || "origin";
  const branch = Bun.env.MODEL_IMAGE_REBUILD_MIRROR_BRANCH;
  await runCommand(branch ? ["git", "push", remote, `HEAD:${branch}`] : ["git", "push", remote, "HEAD"], mirrorPath);
}

async function runCommand(command: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const proc = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}: ${stderr || stdout}`);
  }

  return { stdout, stderr };
}
