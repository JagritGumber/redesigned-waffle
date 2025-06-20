// Example script to run daily (simplified)
// Ensure these paths are correct for your project structure
import PromptGenerationService from "@/services/promptGenerationService";

const promptGenerationService = new PromptGenerationService();

async function dailyRun() {
  try {
    await promptGenerationService.initializeModels();

    const generatedPrompt = await promptGenerationService.generatePrompt(2);

    console.log("Generated Prompt:", generatedPrompt);
  } catch (e) {
    console.error("Runtime Error in daily run", { e });
  }
}

// Execute the daily run function
dailyRun().catch(console.error);
