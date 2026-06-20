import { Show } from "solid-js";
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
