declare module "bun" {
  interface Env {
    NODE_ENV: string;
    RUNPOD_GENERATOR_ID: string;
    RUNPOD_DOWNLOADER_ID: string;
    RUNPOD_WEBHOOK_URL: string;
    RUNPOD_API_KEY: string;
  }
}
