// @/schema/generatorPrompts.ts
import { GeneratePromptRequestPayloadType } from "@/validators/generation";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const generatorPrompts = sqliteTable("generator_prompts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  runpodJobId: text("runpod_job_id"),

  status: text("status", {
    enum: [
      "PENDING",
      "RUNNING",
      "COMPLETED",
      "FAILED",
      "WEBHOOK_RECEIVED",
      "CANCELLED",
    ],
  }).notNull(),

  inputPayload: text("input_payload", { mode: "json" })
    .$type<GeneratePromptRequestPayloadType>()
    .notNull(),

  outputPayload: text("output_payload", {
    mode: "json",
  }).$type<any | null>(), // To store the generated prompt output

  errorMessage: text("error_message"),

  errorDetails: text("error_details", {
    mode: "json",
  }).$type<any | null>(),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),

  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),

  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export type InsertGeneratorPrompt = typeof generatorPrompts.$inferInsert;
export type SelectGeneratorPrompt = typeof generatorPrompts.$inferSelect;
