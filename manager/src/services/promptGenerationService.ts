import { ChatDeepInfra } from "@langchain/community/chat_models/deepinfra"; // Keep this import
import db from "../db";
import { civitaiModels, CivitaiModelWithRelations } from "../schema/models";
import { ModelTypes } from "../types/models";
import { eq } from "drizzle-orm";

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
    "sitting_on_person",
    "sitting_on_lap",
    "shoulder_carry",
    "human_chair",
    "straddling",
    "thigh_straddling",
    "upright_straddle",
    "wariza",
    "yokozuwari",
    "standing",
    "balancing",
    "legs_apart",
    "standing_on_one_leg",
    "all_fours",
    "top-down_bottom-up",
    "prostration",
    "bear_position",
    "squatting",
    "spread_eagle_position",
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
    "legs_up",
    "knees_to_chest",
    "legs_over_head",
    "leg_lift",
    "outstretched_legs",
    "split",
    "standing_split",
    "spread_legs",
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
        where: (model, { eq }) => eq(model.type, ModelTypes.Checkpoint),
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
        where: eq(civitaiModels.type, ModelTypes.LORA),
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

  async generatePrompt(eroticLevel: number, userPositionTags?: string[]): Promise<string[]> {
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

    let baseTags: string[] = [];
    let additionalTags: string[] = [];

    let prompt: string = "";
    const levelOneTags = ["masterpiece", "high_quality"];

    switch (eroticLevel) {
      case 1:
        baseTags = ["1girl", "youthful", "long_hair", "portrait", "innocent", "looking_at_viewer"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }.
        Select 2-5 additional tags from the following list: ${levelOneTags.join(
          ", "
        )}. Be creative and think outside the box. Consider adding tags that enhance the innocence and youthfulness of the image.
        Select 0-3 position tags from the following list, considering natural and appealing positions: ${this.POSITION_TAGS.join(
          ", "
        )}.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: smiling, bright_eyes, rosy_cheeks, playful, carefree.`;
        break;
      case 2:
        baseTags = ["1girl", "solo", "long_hair", "rope", "bdsm"];
        additionalTags = ["blindfold"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }.
        Base tags: ${baseTags.join(", ")}.
        Additional tags: ${additionalTags.join(", ")}.
        Select 0-3 position tags suitable for a basic bondage scenario from the following list: ${this.POSITION_TAGS.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that suggest vulnerability and restraint.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: struggling, pleading, teary_eyes, blushing, submissive.`;
        break;
      case 3:
        baseTags = ["1girl", "solo", "long_hair", "shibari", "gag"];
        additionalTags = ["gag", "rope"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }. Don't make something that breaks human anatomy.
        Select 2-5 additional tags from the following list: ${levelOneTags.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that suggest intense sensation and helplessness.
        Select 0-3 position tags from the following list, considering natural and appealing positions: ${this.POSITION_TAGS.join(
          ", "
        )}.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: breathless, flushed, whimpering, desperate, bound_and_gagged.`;
        break;
      case 2:
        baseTags = ["1girl", "solo", "long_hair", "bondage", "rope", "bound_arms", "nsfw"];
        additionalTags = ["blindfold"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }. Don't make something that breaks human anatomy. The image should depict low-level bondage, such as rope ties or gentle restraints.
        Base tags: ${baseTags.join(", ")}.
        Additional tags: ${additionalTags.join(", ")}.
        Select 0-3 position tags suitable for a basic bondage scenario from the following list: ${this.POSITION_TAGS.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that suggest vulnerability and restraint.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: struggling, pleading, teary_eyes, blushing, submissive.`;
        break;
      case 3:
        baseTags = ["1girl", "solo", "long_hair", "bondage", "shibari", "gag"];
        additionalTags = ["gag", "rope"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }. Don't make something that breaks human anatomy.
        Base tags: ${baseTags.join(", ")}.
        Additional tags: ${additionalTags.join(", ")}.
        Select 0-3 position tags suitable for a strict bondage scenario from the following list: ${this.POSITION_TAGS.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that suggest intense sensation and helplessness.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: breathless, flushed, whimpering, desperate, bound_and_gagged.`;
        break;
      case 4:
        baseTags = ["1girl", "solo", "long_hair", "bondage", "shibari", "gag", "collar"];
        additionalTags = ["gag", "rope", "collar"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }. Don't make something that breaks human anatomy.
        Base tags: ${baseTags.join(", ")}.
        Additional tags: ${additionalTags.join(", ")}.
        Select 0-3 position tags suitable for a strict bondage scenario from the following list: ${this.POSITION_TAGS.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that suggest submission, desperation, and confinement.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: tearful, pleading_eyes, chained, helpless, defeated.`;
        break;
      default:
        baseTags = ["1girl", "solo", "long_hair", "portrait", "looking_at_viewer"];
        additionalTags = ["wholesome", "cute", "innocent"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }. Don't make something that breaks human anatomy.
        Base tags: ${baseTags.join(", ")}.
        Additional tags: ${additionalTags.join(", ")}.
        Select 0-3 position tags from the following list: ${this.POSITION_TAGS.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that enhance the innocence and youthfulness of the image.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: smiling, bright_eyes, rosy_cheeks, playful, carefree.`;
        break;
      case 5: // New case for extreme bondage and sex
        baseTags = ["1girl", "solo", "nsfw", "extreme_bondage", "sex", "explicit"];
        additionalTags = ["vibrator", "dildo", "gag", "blindfold", "rope", "collar"];
        prompt = `You are an AI artist who is generating tags for an image. Your goal is to create a diverse and interesting set of tags that will help to generate a high-quality image. You can change the base tags if you conclude they are wrong or the image won't be erotic for that level.
        Generate a JSON object with tags for an image, selecting from the following options. Return a JSON object with a "tags" array. Example: { "tags": [] }. Don't make something that breaks human anatomy.
        Base tags: ${baseTags.join(", ")}.
        Additional tags: ${additionalTags.join(", ")}.
        Select 0-3 explicit position tags for extreme bondage and sex scenarios from the following list: ${this.POSITION_TAGS.join(
          ", "
        )}. Be creative and think outside the box. Consider tags that suggest dominance, submission, and pleasure.
        Select 0-1 head posture tags from the following list: ${this.HEAD_POSTURE_TAGS.join(", ")}.
        Select 0-1 torso tags from the following list: ${this.TORSO_TAGS.join(", ")}.
        Select 0-1 arms tags from the following list: ${this.ARMS_TAGS.join(", ")}.
        Select 0-1 hips tags from the following list: ${this.HIPS_TAGS.join(", ")}.
        Select 0-1 legs tags from the following list: ${this.LEGS_TAGS.join(", ")}.
        Example of diverse and interesting tags: moaning, panting, orgasmic_face, restrained, pleasured.`;
        break;
    }

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

      tags = [...baseTags, ...parseJson(response.content as string).tags, ...additionalTags];
    } catch (error) {
      console.error("Error parsing JSON responses:", error);
      return baseTags; // Return base tags as fallback
    }

    return [tags.join(", ")];
  }
}

export default PromptGenerationService;
