declare module "bun" {
  interface Env {
    NODE_ENV: string;
    RUNPOD_GENERATOR_ID: string;
    RUNPOD_DOWNLOADER_ID: string;
    RUNPOD_WEBHOOK_URL: string;
    RUNPOD_API_KEY: string;
    MODEL_IMAGE_REBUILD_PROVIDER: string;
    MODEL_IMAGE_REBUILD_MIRROR_TOKEN: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_PUBLIC_BUCKET_URL: string;
    R2_BUCKET_NAME: string;
  }
}
