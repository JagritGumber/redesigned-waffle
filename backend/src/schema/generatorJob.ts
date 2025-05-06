// @/schema/generatorJobs.ts
import {InfoParsedResult} from "@/types/generator";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const generatorJobs = sqliteTable("generator_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  runpodJobId: text("runpod_job_id"),

  status: text("status", {
    // Add 'CANCELLED' to the possible statuses
    enum: [
      "PENDING",
      "RUNNING",
      "COMPLETED",
      "FAILED",
      "WEBHOOK_RECEIVED",
      "CANCELLED",
    ],
  }).notNull(),

  inputPayload: text("input_payload").notNull(),

  generationInfo: text("generation_info", {
    mode: "json",
  }).$type<InfoParsedResult | null>(),

  imageKey: text("image_key"),

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

  completedAt: integer("completed_at", { mode: "timestamp_ms" }), // Use this for COMPLETED jobs
});

export type InsertGeneratorJob = typeof generatorJobs.$inferInsert;
export type SelectGeneratorJob = typeof generatorJobs.$inferSelect;
