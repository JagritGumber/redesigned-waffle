import { Patterns, cron } from "@elysiajs/cron";
import PromptGenerationService from "@/services/promptGenerationService";

const rootCron = cron({
  name: "rootBeat",
  pattern: Patterns.daily(),
  async run() {
    if (!Bun.env.DEEPINFRA_API_TOKEN) {
      console.warn("Skipping prompt generation cron: DEEPINFRA_API_TOKEN is not set.");
      return;
    }

    const promptGenerationService = new PromptGenerationService();

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
