import { For, Show } from "solid-js";
import { Badge } from "./ui/badge";

export const activeModelInstallStatuses = [
  "REGISTERING",
  "DOWNLOADING",
  "BUILD_QUEUED",
  "BUILDING",
] as const;

const activeStatuses = new Set<string>(activeModelInstallStatuses);
const failedStatuses = new Set(["DOWNLOAD_FAILED", "BUILD_FAILED"]);

export function isActiveModelInstall(status?: string | null) {
  return status ? activeStatuses.has(status) : false;
}

export function modelInstallStatusLabel(status?: string | null) {
  switch (status) {
    case "REGISTERING":
      return "Preparing";
    case "DOWNLOADING":
      return "Downloading";
    case "BUILD_QUEUED":
      return "Build queued";
    case "BUILDING":
      return "Building image";
    case "READY":
      return "Ready";
    case "DOWNLOAD_FAILED":
      return "Download failed";
    case "BUILD_FAILED":
      return "Build failed";
    default:
      return null;
  }
}

export function ModelInstallStatus(props: {
  status?: string | null;
  message?: string | null;
  class?: string;
  messageClass?: string;
  showMessage?: boolean;
}) {
  const label = () => modelInstallStatusLabel(props.status);
  const message = () => props.message?.trim();
  const variant = () => {
    if (failedStatuses.has(props.status ?? "")) return "error";
    if (isActiveModelInstall(props.status)) return "warning";
    if (props.status === "READY") return "success";
    return "secondary";
  };

  return (
    <Show when={label()}>
      <span class={props.class} title={message() ?? undefined}>
        <Badge variant={variant()}>{label()}</Badge>
        <Show when={props.showMessage && message()}>
          <span
            class={
              props.messageClass ??
              "block max-w-full truncate pt-1 text-xs font-medium text-muted-foreground"
            }
          >
            {message()}
          </span>
        </Show>
      </span>
    </Show>
  );
}

export type ModelInstallProgressProps = {
  status?: string | null;
  message?: string | null;
  buildTriggerId?: string | null;
  runpodJobId?: string | null;
  imageName?: string | null;
  runpodPath?: string | null;
  downloadCompletedAt?: string | number | Date | null;
  buildTriggeredAt?: string | number | Date | null;
  deployedAt?: string | number | Date | null;
  class?: string;
};

function statusTime(value?: string | number | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stageVariant(
  stage: "registered" | "model-layer" | "image-build" | "deployed",
  status?: string | null,
) {
  if (!status) return "secondary";
  if (stage === "registered") return "success";
  if (stage === "model-layer" && status === "DOWNLOAD_FAILED") return "error";
  if (stage === "image-build" && status === "BUILD_FAILED") return "error";
  if (stage === "deployed" && status === "READY") return "success";
  if (stage === "model-layer" && ["DOWNLOADING", "BUILD_QUEUED", "BUILDING"].includes(status)) {
    return "warning";
  }
  if (stage === "image-build" && ["BUILD_QUEUED", "BUILDING"].includes(status)) {
    return "warning";
  }
  if (status === "READY") return "success";
  if (["DOWNLOAD_FAILED", "BUILD_FAILED"].includes(status)) return "secondary";
  return "secondary";
}

function stageDetail(
  stage: "registered" | "model-layer" | "image-build" | "deployed",
  props: ModelInstallProgressProps,
) {
  if (stage === "registered") return "Install registered for this account.";
  if (stage === "model-layer") {
    if (props.status === "DOWNLOADING") return "Direct RunPod download is running.";
    if (props.status === "BUILD_QUEUED") return "Model migration is queued for the Docker image build.";
    if (props.status === "BUILDING") return "RunPod is baking the model layer into the generator image.";
    if (props.status === "DOWNLOAD_FAILED") return props.message ?? "Model download failed.";
    return props.runpodPath ?? "Model file path will appear after install starts.";
  }
  if (stage === "image-build") {
    if (props.status === "BUILD_QUEUED") return "Waiting for RunPod to start the image build.";
    if (props.status === "BUILDING") return "RunPod image build is active.";
    if (props.status === "BUILD_FAILED") return props.message ?? "RunPod image build failed.";
    return props.buildTriggerId ? `Build ${props.buildTriggerId}` : "Build ID will appear after queuing.";
  }
  if (props.status === "READY") {
    return props.imageName ? `Ready image: ${props.imageName}` : "Generator image is ready.";
  }
  return "Waiting for deployment.";
}

export function ModelInstallProgress(props: ModelInstallProgressProps) {
  const stages = () => [
    {
      id: "registered" as const,
      label: "Registered",
      time: null,
    },
    {
      id: "model-layer" as const,
      label: "Model layer",
      time: statusTime(props.downloadCompletedAt),
    },
    {
      id: "image-build" as const,
      label: "Image build",
      time: statusTime(props.buildTriggeredAt),
    },
    {
      id: "deployed" as const,
      label: "RunPod ready",
      time: statusTime(props.deployedAt),
    },
  ];

  return (
    <Show when={props.status}>
      <section class={props.class ?? "rounded-md border border-border bg-card p-3"}>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold">Install progress</h2>
          </div>
          <ModelInstallStatus status={props.status} message={props.message} />
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <For each={stages()}>
            {(stage) => (
              <div class="min-w-0 rounded-md border border-border bg-background p-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs font-semibold">{stage.label}</span>
                  <Badge variant={stageVariant(stage.id, props.status)} class="shrink-0">
                    {stageVariant(stage.id, props.status) === "success"
                      ? "Done"
                      : stageVariant(stage.id, props.status) === "warning"
                        ? "Active"
                        : stageVariant(stage.id, props.status) === "error"
                          ? "Failed"
                          : "Waiting"}
                  </Badge>
                </div>
                <p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {stageDetail(stage.id, props)}
                </p>
                <Show when={stage.time}>
                  <p class="mt-2 text-[11px] font-medium text-muted-foreground">{stage.time}</p>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <Show when={props.buildTriggerId}>
            <p class="min-w-0 truncate">
              <span class="font-medium text-foreground">Build:</span> {props.buildTriggerId}
            </p>
          </Show>
          <Show when={props.runpodJobId}>
            <p class="min-w-0 truncate">
              <span class="font-medium text-foreground">RunPod job:</span> {props.runpodJobId}
            </p>
          </Show>
          <Show when={props.imageName}>
            <p class="min-w-0 truncate">
              <span class="font-medium text-foreground">Image:</span> {props.imageName}
            </p>
          </Show>
          <Show when={props.runpodPath}>
            <p class="min-w-0 truncate">
              <span class="font-medium text-foreground">Path:</span> {props.runpodPath}
            </p>
          </Show>
        </div>
      </section>
    </Show>
  );
}
