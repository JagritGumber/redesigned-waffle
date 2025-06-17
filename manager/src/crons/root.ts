import { Patterns, cron } from "@elysiajs/cron";
import { promptGenerationService } from "@/services/promptGenerationService";

const rootCron = cron({
  name: "rootBeat",
  pattern: Patterns.daily(),
  async run() {
    try {
      await promptGenerationService.initializeModels();

      const generatedPrompt = await promptGenerationService.generatePrompt(9);

      console.log("Generated Prompt:", generatedPrompt);
    } catch (e) {
      console.error("Runtime Error in daily run", { e });
    }
  },
});

export default rootCron;
