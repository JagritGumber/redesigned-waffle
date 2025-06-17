import { ChatDeepInfra } from "@langchain/community/chat_models/deepinfra"; // Assuming this is the correct import path
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { PromptTemplate } from "@langchain/core/prompts";
import db from "@/db"; // Assuming db is available at this path
import { civitaiModels } from "@/schema/models"; // Import the schema
import { ModelTypes } from "@/types/models"; // Import ModelTypes enum
import { eq } from "drizzle-orm";

class PromptGenerationService {
  private chatModel: ChatDeepInfra;
  private checkpoints: string[] = [];
  private loras: string[] = [];

  constructor() {
    this.chatModel = new ChatDeepInfra({
      apiKey: Bun.env.DEEPINFRA_API_KEY,
      temperature: 0.9,
      model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    });
  }

  async initializeModels(): Promise<void> {
    try {
      const checkpointModels = await db
        .select({ name: civitaiModels.name })
        .from(civitaiModels)
        .where(eq(civitaiModels.type, ModelTypes.Checkpoint));
      this.checkpoints = checkpointModels.map((model) => model.name);

      const loraModels = await db
        .select({ name: civitaiModels.name })
        .from(civitaiModels)
        .where(eq(civitaiModels.type, ModelTypes.LORA));
      this.loras = loraModels.map((model) => model.name);

      console.log(`Loaded ${this.checkpoints.length} checkpoints and ${this.loras.length} LORAs.`);
    } catch (error) {
      console.error("Error loading models from database:", error);
      // Fallback to empty arrays if DB fetch fails
      this.checkpoints = [];
      this.loras = [];
    }
  }

  private selectRandom<T>(items: T[]): T | undefined {
    if (items.length === 0) {
      return undefined;
    }
    return items[Math.floor(Math.random() * items.length)];
  }

  async generatePrompt(eroticLevel: number): Promise<string> {
    if (this.checkpoints.length === 0 || this.loras.length === 0) {
      await this.initializeModels(); // Ensure models are loaded before generating
    }

    const selectedCheckpoint = this.selectRandom(this.checkpoints);
    const selectedLora = this.selectRandom(this.loras);

    if (!selectedCheckpoint || !selectedLora) {
      console.warn("Could not select a checkpoint or Lora. Returning a generic prompt.");
      return "A beautiful scene with intricate details.";
    }

    let eroticismDescription = "";
    if (eroticLevel >= 8) {
      eroticismDescription =
        "highly explicit and intensely sensual, focusing on themes of extreme BDSM, deep bondage, and profound submission.";
    } else if (eroticLevel >= 5) {
      eroticismDescription =
        "moderately explicit and sensual, with clear elements of BDSM, bondage, and dominance/submission.";
    } else if (eroticLevel >= 2) {
      eroticismDescription =
        "subtly sensual with hints of BDSM or bondage, focusing more on atmosphere and implied themes.";
    } else {
      eroticismDescription =
        "non-explicit, focusing on artistic and aesthetic qualities, with very subtle or no BDSM/bondage themes.";
    }

    const promptTemplate = PromptTemplate.fromTemplate(
      `You are an AI assistant specialized in generating highly detailed and evocative prompts for images, formatted as Danbooru tags.
      The prompt should be a comma-separated list of tags, suitable for an image generation model.
      Include descriptive details about the scene, characters, attire, setting, and actions as tags.
      The prompt should be ${eroticismDescription}
      Ensure the tags are creative, vivid, and inspiring for image generation.
      
      Consider the following:
      - Checkpoint: {checkpoint}
      - Lora: {lora}
      
      Generate a single, concise, comma-separated list of Danbooru-style tags.
      YOU NEED TO CREATE A PROMPT NOT IMAGE
      `
    );

    const formattedPrompt = await promptTemplate.format({
      checkpoint: selectedCheckpoint,
      lora: selectedLora,
    });

    const messages = [
      new SystemMessage("You are a creative assistant for generating image prompts."),
      new HumanMessage(formattedPrompt),
    ];

    try {
      const { content } = await this.chatModel.invoke(messages);
      return content.toString();
    } catch (error) {
      console.error("Error generating prompt with Langchain:", error);
      return "Failed to generate prompt.";
    }
  }
}

export const promptGenerationService = new PromptGenerationService();
