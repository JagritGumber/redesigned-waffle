// src/schema/trainingState.ts
import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm"; // Import sql for default value

export const trainingState = sqliteTable("training_state", {
  // We expect only one row in this table, maybe with id = 1
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastTrainedPostId: integer("last_trained_post_id").notNull().default(0),
  // Add a timestamp to track when training last happened (optional but good)
  lastTrainedAt: integer("last_trained_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()), // SQLite timestamp in seconds
});

export type InsertTrainingState = typeof trainingState.$inferInsert;
export type SelectTrainingState = typeof trainingState.$inferSelect;
