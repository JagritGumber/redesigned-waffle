import { ChatDeepInfra } from "@langchain/community/chat_models/deepinfra"; // Keep this import
import db from "../db";
import { civitaiModels, CivitaiModelWithRelations } from "../schema/models";
import { ModelTypes } from "../types/models";
import { and, eq } from "drizzle-orm";

class PromptGenerationService {
  private chatModel: ChatDeepInfra; // Keep chatModel
  private checkpoints: CivitaiModelWithRelations[] = [];
  private loras: CivitaiModelWithRelations[] = [];

  private readonly HEAD_POSTURE_TAGS = ["head_down", "head_tilt", "head_back"];
  private readonly POSITION_TAGS = [
    "kneeling",
    "on_one_knee",
    "lying",
    "crossed_legs",
    "fetal_position",
    "on_back",
    "on_side",
    "on_stomach",
    "sitting",
    "butterfly_sitting",
    "figure_four_sitting",
    "indian_style",
    "lotus_position",
    "hugging_own_legs",
    "reclining",
    "seiza",
    "wariza",
    "yokozuwari",
    "standing",
    "balancing",
    "standing_on_one_leg",
    "squatting",
  ];

  private readonly TORSO_TAGS = [
    "arched_back",
    "bent_back",
    "bent_over",
    "leaning_back",
    "leaning_forward",
    "slouching",
    "sway_back",
    "twisted_torso",
  ];

  private readonly ARMS_TAGS = [
    "arms_behind_back",
    "arm_up",
    "arm_behind_head",
    "arms_up",
    "arms_behind_head",
    "spread_arms",
    "arms_at_sides",
  ];

  private readonly HIPS_TAGS = ["contrapposto", "sway_back"];

  private readonly LEGS_TAGS = [
    "crossed_ankles",
    "folded",
    "leg_up",
    "knees_to_chest",
    "leg_lift",
    "outstretched_legs",
    "split",
    "standing_split",
    "knees_apart_feet_together",
    "knees_together_feet_apart",
    "knee_up",
    "knees_up",
    "tiptoes",
  ];

  constructor() {
    this.chatModel = new ChatDeepInfra({
      // Re-initialize chatModel
      apiKey: Bun.env.DEEPINFRA_API_KEY,
      temperature: 0.9,
      model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    });
  }

  async initializeModels(): Promise<void> {
    try {
      const checkpointModels = await db.query.civitaiModels.findMany({
        where: (model, { and, eq }) =>
          and(eq(model.type, ModelTypes.Checkpoint), eq(model.nsfw, false)),
        with: {
          modelVersions: {
            with: {
              files: true,
              images: true,
            },
          },
          creator: true,
        },
      });
      this.checkpoints = checkpointModels as CivitaiModelWithRelations[];

      const loraModels = await db.query.civitaiModels.findMany({
        where: and(eq(civitaiModels.type, ModelTypes.LORA), eq(civitaiModels.nsfw, false)),
        with: {
          modelVersions: {
            with: {
              files: true,
              images: true,
            },
          },
          creator: true,
        },
      });
      this.loras = loraModels as CivitaiModelWithRelations[];

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

  async generatePrompt(stylePreset: number, userStyleTags?: string[]): Promise<string[]> {
    if (this.checkpoints.length === 0 || this.loras.length === 0) {
      await this.initializeModels(); // Ensure models are loaded before generating
    }

    const selectedCheckpoint = this.selectRandom(this.checkpoints);
    const selectedLora = this.selectRandom(this.loras);

    if (!selectedCheckpoint || !selectedLora) {
      console.warn("Could not select a checkpoint or Lora. Returning a generic prompt.");
      return ["A beautiful scene with intricate details."];
    }

    const checkpointVersion = selectedCheckpoint.modelVersions[0];
    const loraVersion = selectedLora.modelVersions[0];

    if (!checkpointVersion || !loraVersion) {
      console.warn(
        "Could not select a checkpoint version or Lora version. Returning a generic prompt."
      );
      return ["A beautiful scene with intricate details."];
    }

    const checkpointTriggerWords = checkpointVersion.trainedWords?.join(", ");
    const loraTriggerWords = loraVersion.trainedWords?.join(", ");

    const blockedTags = new Set([
      "nsfw",
      "explicit",
      "erotic",
      "nude",
      "completely_nude",
      "sex",
      "group_sex",
      "sex_from_behind",
      "sex_toy",
      "uncensored",
      "bdsm",
      "bondage",
      "shibari",
      "gag",
      "vibrator",
      "dildo",
    ]);
    const cleanTags = (tags: string[]) =>
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0 && !blockedTags.has(tag.toLowerCase()));

    const presets: Record<number, { baseTags: string[]; focus: string; examples: string }> = {
      1: {
        baseTags: ["portrait", "solo_subject", "expressive_face", "clean_background"],
        focus: "a polished portrait or avatar suitable for a professional creative studio",
        examples: "soft lighting, natural expression, sharp focus, balanced composition",
      },
      2: {
        baseTags: ["product_photography", "studio_lighting", "minimal_background"],
        focus: "a product or object render with commercial-grade lighting",
        examples: "high detail, reflective surface, color harmony, catalog-ready",
      },
      3: {
        baseTags: ["environment", "cinematic_lighting", "wide_composition"],
        focus: "an environment, interior, or landscape concept for visual development",
        examples: "atmospheric depth, golden hour, architectural detail, rich materials",
      },
      4: {
        baseTags: ["character_design", "full_body", "dynamic_pose", "clear_silhouette"],
        focus: "a character design sheet or hero character illustration",
        examples: "distinct costume, readable silhouette, expressive pose, detailed accessories",
      },
      5: {
        baseTags: ["editorial_image", "art_direction", "premium_finish"],
        focus: "an editorial or campaign-style image for brand storytelling",
        examples: "dramatic lighting, tasteful styling, premium materials, refined composition",
      },
    };

    const selectedPreset = presets[stylePreset] ?? presets[1];
    const baseTags = cleanTags([
      ...selectedPreset.baseTags,
      ...(checkpointTriggerWords ? checkpointTriggerWords.split(",") : []),
      ...(loraTriggerWords ? loraTriggerWords.split(",") : []),
      ...(userStyleTags ?? []),
    ]);

    const prompt = `You are helping a self-hostable image generation studio create safe-for-work prompt tags.
      Generate a JSON object with a "tags" array only. Example: { "tags": [] }.
      The image direction is: ${selectedPreset.focus}.
      Base tags: ${baseTags.join(", ")}.
      Select 4-8 additional safe-for-work tags that improve image quality, art direction, lighting, composition, materials, camera style, or setting.
      You may select 0-2 natural pose tags from this list when they fit the concept: ${this.POSITION_TAGS.join(", ")}.
      Do not include adult, explicit, nude, fetish, sexual, or age-coded terms.
      Example safe tags: ${selectedPreset.examples}.`;

    const response = await this.chatModel.invoke(prompt);

    let tags: string[] = [];

    try {
      const parseJson = (jsonString: string) => {
        console.log("Original JSON string:", jsonString);
        try {
          // Use a regex to extract the JSON object
          const jsonRegex = /\{[\s\S]*?\}/;
          const match = jsonString.match(jsonRegex);

          if (!match) {
            throw new Error("No JSON object found in string");
          }

          const json = match[0];
          console.log("Extracted JSON:", json);

          const parsedJson = JSON.parse(json);
          console.log("Parsed JSON:", parsedJson);
          return parsedJson;
        } catch (error) {
          console.error("JSON parsing error:", error);
          throw new Error("Failed to parse JSON");
        }
      };

      tags = cleanTags([...baseTags, ...parseJson(response.content as string).tags]);
    } catch (error) {
      console.error("Error parsing JSON responses:", error);
      return baseTags; // Return base tags as fallback
    }

    return [tags.join(", ")];
  }
}

export default PromptGenerationService;
