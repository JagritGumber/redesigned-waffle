import { DrizzleD1Database } from "drizzle-orm/d1";

export interface ContextForHono {
  Bindings: CloudflareBindings & {
    MODEL_IMAGE_REBUILD_PROVIDER?: string;
    MODEL_IMAGE_REBUILD_ALLOW_GITHUB_METADATA?: string;
    MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY?: string;
    MODEL_IMAGE_REBUILD_GITHUB_TOKEN?: string;
    MODEL_IMAGE_WEBHOOK_TOKEN?: string;
    MODEL_IMAGE_RUNPOD_BUILD_POLLING?: string;
  };
  Variables: {
    db: DrizzleD1Database<typeof import("@/schema")>;
    authUser: {
      user?: {
        id?: string | null;
        email?: string | null;
        name?: string | null;
      } | null;
      session?: {
        user?: {
          id?: string | null;
          email?: string | null;
          name?: string | null;
        } | null;
      } | null;
      token?: {
        sub?: string | null;
      } | null;
    } | null;
  };
}
