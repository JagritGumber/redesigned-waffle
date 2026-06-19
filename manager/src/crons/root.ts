import { Patterns, cron } from "@elysiajs/cron";
import PromptGenerationService from "@/services/promptGenerationService";

const promptGenerationService = new PromptGenerationService();

const rootCron = cron({
  name: "rootBeat",
  pattern: Patterns.daily(),
  async run() {
    try {
      await promptGenerationService.initializeModels();

      const generatedPrompt = await promptGenerationService.generatePrompt(3);

      console.log("Generated Prompt:", generatedPrompt);
    } catch (e) {
      console.error("Runtime Error in daily run", { e });
    }
  },
});

export default rootCron;
