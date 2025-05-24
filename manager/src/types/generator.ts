export type InfoParsedResult = {
  prompt: string;
  all_prompts: string[];
  negative_prompt: string;
  all_negative_prompts: string[];
  seed: number;
  all_seeds: number[];
  subseed: number;
  all_subseeds: number[];
  subseed_strength: number;
  width: number;
  height: number;
  sampler_name: string | "Euler";
  cfg_scale: number; // decimal
  steps: number; // usually 25
  batch_size: number; // usually just 1
  restore_faces: boolean;
  face_restoration_model: null | string;
  sd_model_name: string;
  sd_model_hash: null; // Idk what else fits this, I have always gotten this
  sd_vae_name: null | string;
  sd_vae_hash: null; // Again not sure, always seen this
  seed_resize_from_w: number;
  seed_resize_from_h: number;
  denoising_strength: null;
  extra_generation_params: Record<string, any>;
  index_of_first_image: number;
  infotexts: string[];
  styles: any[]; // idk what this array will have
  job_timestamp: string; // Timestamp string
  clip_skip: number;
  is_using_inpainting_conditioning: boolean;
  version: string;
};
