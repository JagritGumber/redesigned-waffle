export type ModelImageWebhookState = {
  normalizedStatus: string;
  modelStatus: "DOWNLOADED" | "BUILD_FAILED" | "BUILDING";
  deployedAt: Date | null;
};

export function resolveModelImageWebhookState(input: {
  status: string;
  now?: Date;
}): ModelImageWebhookState {
  const normalizedStatus = input.status.toUpperCase();
  const isReadyStatus = normalizedStatus === "COMPLETED" || normalizedStatus === "DEPLOYED";
  const isFailedStatus = ["FAILED", "ERROR", "CANCELLED", "TEST_FAILED"].includes(
    normalizedStatus,
  );
  const modelStatus =
    isReadyStatus
      ? "DOWNLOADED"
      : isFailedStatus
        ? "BUILD_FAILED"
        : "BUILDING";

  return {
    normalizedStatus,
    modelStatus,
    deployedAt: isReadyStatus ? input.now ?? new Date() : null,
  };
}
