export type ModelImageWebhookState = {
  normalizedStatus: string;
  installStatus: "READY" | "BUILD_FAILED" | "BUILDING";
  statusMessage: string;
  deployedAt: Date | null;
};

export function resolveModelImageWebhookState(input: {
  status: string;
  image?: string | null;
  message?: string | null;
  now?: Date;
}): ModelImageWebhookState {
  const normalizedStatus = input.status.toUpperCase();
  const isReadyStatus = normalizedStatus === "COMPLETED" || normalizedStatus === "DEPLOYED";
  const isFailedStatus = ["FAILED", "ERROR", "CANCELLED", "TEST_FAILED"].includes(
    normalizedStatus,
  );
  const installStatus =
    isReadyStatus
      ? "READY"
      : isFailedStatus
        ? "BUILD_FAILED"
        : "BUILDING";

  return {
    normalizedStatus,
    installStatus,
    statusMessage:
      input.message ||
      (installStatus === "READY"
        ? `Docker image ${input.image || ""} is ready for RunPod.`
        : `Docker image build status: ${input.status}`),
    deployedAt: isReadyStatus ? input.now ?? new Date() : null,
  };
}
