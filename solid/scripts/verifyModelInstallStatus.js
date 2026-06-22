import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const statusComponent = readFileSync("src/components/model-install-status.tsx", "utf-8");
const downloadedHook = readFileSync("src/hooks/useDownloadedModels.ts", "utf-8");
const installedHook = readFileSync("src/hooks/useInstalledModel.ts", "utf-8");
const generationModelsHook = readFileSync("src/hooks/useGenerationModels.ts", "utf-8");
const modelCard = readFileSync("src/components/model-card.tsx", "utf-8");
const detailRoute = readFileSync("src/routes/models.$id.$vId.tsx", "utf-8");
const generationRoute = readFileSync("src/routes/tabs/two.tsx", "utf-8");

for (const status of ["REGISTERING", "DOWNLOADING", "BUILD_QUEUED", "BUILDING"]) {
  assert(
    statusComponent.includes(`"${status}"`),
    `Model install status component should treat ${status} as an active status.`,
  );
}

for (const status of ["READY", "DOWNLOAD_FAILED", "BUILD_FAILED"]) {
  assert(
    statusComponent.includes(`case "${status}"`) ||
      statusComponent.includes(`props.status === "${status}"`),
    `Model install status component should render ${status}.`,
  );
}

assert(
  statusComponent.includes("activeModelInstallStatuses") &&
    statusComponent.includes("isActiveModelInstall") &&
    statusComponent.includes("showMessage") &&
    statusComponent.includes("title={message()") &&
    statusComponent.includes("ModelInstallProgress") &&
    statusComponent.includes("buildTriggerId") &&
    statusComponent.includes("imageName") &&
    statusComponent.includes("RunPod ready"),
  "Model install status component should expose active state and visible/tooltip messages.",
);
assert(
  downloadedHook.includes("isActiveModelInstall") &&
    downloadedHook.includes("refetchInterval") &&
    downloadedHook.includes("5000") &&
    downloadedHook.includes("withCredentials: true"),
  "Downloaded models list should poll while any account install is active.",
);
assert(
  installedHook.includes("isActiveModelInstall") &&
    installedHook.includes("refetchInterval") &&
    installedHook.includes("5000") &&
    installedHook.includes("withCredentials: true"),
  "Installed model detail query should poll while that install is active.",
);
assert(
  generationModelsHook.includes("isActiveModelInstall") &&
    generationModelsHook.includes("refetchInterval") &&
    generationModelsHook.includes("5000") &&
    generationModelsHook.includes("withCredentials: true"),
  "Generation model lists should poll while any selectable account install is active.",
);
assert(
  modelCard.includes("ModelInstallStatus") &&
    modelCard.includes("statusMessage") &&
    modelCard.includes("showMessage") &&
    modelCard.includes("isReadyForGeneration") &&
    modelCard.includes("cursor-not-allowed") &&
    modelCard.includes("Model is not ready for generation yet."),
  "Model cards should surface install status messages and block selecting non-ready generation models.",
);
assert(
  detailRoute.includes("ModelInstallStatus") &&
    detailRoute.includes("ModelInstallProgress") &&
    detailRoute.includes("installMessage") &&
    detailRoute.includes("installProgress") &&
    detailRoute.includes("installToastMessage") &&
    detailRoute.includes("Docker image build may take a while"),
  "Model detail page should surface install status, lifecycle details, and long-running build messaging.",
);
assert(
  generationRoute.includes("withCredentials: true") &&
    generationRoute.includes("responseData?.models") &&
    generationRoute.includes("Image generation job started.") &&
    generationRoute.includes("Failed to start image generation."),
  "Generation route should send credentials and surface model readiness failures from the backend.",
);

console.log("Solid model install status verification passed.");
