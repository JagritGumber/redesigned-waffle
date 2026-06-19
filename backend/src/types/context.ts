import { DrizzleD1Database } from "drizzle-orm/d1";

export interface ContextForHono {
  Bindings: CloudflareBindings;
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
