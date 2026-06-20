import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const statusComponent = readFileSync("src/components/model-install-status.tsx", "utf-8");
const downloadedHook = readFileSync("src/hooks/useDownloadedModels.ts", "utf-8");
const installedHook = readFileSync("src/hooks/useInstalledModel.ts", "utf-8");
const modelCard = readFileSync("src/components/model-card.tsx", "utf-8");
const detailRoute = readFileSync("src/routes/models.$id.$vId.tsx", "utf-8");

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
    statusComponent.includes("title={message()"),
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
  modelCard.includes("ModelInstallStatus") &&
    modelCard.includes("statusMessage") &&
    modelCard.includes("showMessage"),
  "Model cards should surface install status messages.",
);
assert(
  detailRoute.includes("ModelInstallStatus") &&
    detailRoute.includes("installMessage") &&
    detailRoute.includes("installToastMessage") &&
    detailRoute.includes("Docker image build may take a while"),
  "Model detail page should surface install status and long-running build messaging.",
);

console.log("Solid model install status verification passed.");
