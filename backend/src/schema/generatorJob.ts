import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

export const generatorJobs = sqliteTable("generator_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  runpodJobId: text("runpod_job_id"),

  status: text("status", {
    enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "WEBHOOK_RECEIVED"],
  }).notNull(),

  inputPayload: text("input_payload").notNull(),

  resultPayload: text("result_payload"),

  errorMessage: text("error_message"),

  errorDetails: text("error_details"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),

  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),

  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export type InsertGeneratorJob = typeof generatorJobs.$inferInsert;
export type SelectGeneratorJob = typeof generatorJobs.$inferSelect;
