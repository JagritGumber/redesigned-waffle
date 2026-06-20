import { cron } from "@elysiajs/cron";
import { pollRunPodModelImageBuilds } from "@/services/runpodBuildStatusService";

const runpodBuildStatusCron = cron({
  name: "runpodModelImageBuildStatus",
  pattern: "*/1 * * * *",
  async run() {
    try {
      const result = await pollRunPodModelImageBuilds();
      if (!result.skipped && result.checked > 0) {
        console.log(
          `RunPod model image build poll checked ${result.checked} installs and updated ${result.updated}.`,
        );
      }
    } catch (error) {
      console.error("RunPod model image build polling failed:", error);
    }
  },
});

export default runpodBuildStatusCron;
