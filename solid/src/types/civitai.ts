import { ModelTypes } from "~/backend/types/models";

export interface Stats {
  downloadCount: number;
  favoriteCount: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  commentCount: number;
  ratingCount: number;
  rating: number;
  tippedAmountCount: number;
}

export interface Creator {
  username: string;
  image: string;
}

export interface Hash {
  AutoV1: string;
  AutoV2: string;
  SHA256: string;
  CRC32: string;
  BLAKE3: string;
  AutoV3?: string;
}

export interface Metadata {
  format: string;
  size: string | null;
  fp: string | null;
}

export interface FileVersion {
  id: number;
  sizeKB: number;
  name: string;
  type: string;
  pickleScanResult: string;
  pickleScanMessage: string | null;
  virusScanResult: string;
  virusScanMessage: string | null;
  scannedAt: string;
  metadata: Metadata;
  hashes: Hash;
  downloadUrl: string;
  primary: boolean;
}

export interface ImageInfo {
  url: string;
  nsfwLevel: number;
  width: number;
  height: number;
  hash: string;
  type: string;
  hasMeta: boolean;
  hasPositivePrompt: boolean;
  onSite: boolean;
  remixOfId: number | null;
  meta: any | null;
}

export interface ModelVersion {
  id: number;
  index: number;
  name: string;
  baseModel: string;
  baseModelType: string;
  publishedAt: string;
  updatedAt: string;
  availability: string;
  nsfwLevel: number;
  description: string | null;
  trainedWords: string[];
  stats: Stats;
  supportsGeneration: boolean;
  files: FileVersion[];
  images: ImageInfo[];
  downloadUrl: string;
}

export interface Model {
  id: number;
  name: string;
  description: string;
  allowNoCredit: boolean;
  allowCommercialUse: string[];
  allowDerivatives: boolean;
  allowDifferentLicense: boolean;
  type:
    | ModelTypes.Checkpoint
    | ModelTypes.Controlnet
    | ModelTypes.TextualInversion
    | ModelTypes.Hypernetwork
    | ModelTypes.AestheticGradient
    | ModelTypes.LORA
    | ModelTypes.Poses;
  minor: boolean;
  poi: boolean;
  nsfw: boolean;
  nsfwLevel: number;
  availability: string;
  cosmetic: null;
  supportsGeneration: boolean;
  stats: Stats;
  creator: Creator;
  tags: string[];
  modelVersions: ModelVersion[];
  downloadUrl: string;
}
