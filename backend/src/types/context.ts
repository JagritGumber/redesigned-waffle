import { DrizzleD1Database } from "drizzle-orm/d1";

export interface ContextForHono {
  Bindings: CloudflareBindings;
  Variables: {
    db: DrizzleD1Database;
  };
}
