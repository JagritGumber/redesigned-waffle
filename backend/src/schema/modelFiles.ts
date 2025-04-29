import { relations } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { civitaiModelVersions } from "./modelVersions";
import { civitaiFilesMetadata } from "./modelFilesMetadata";

export const civitaiFiles = sqliteTable("civitaiFile", {
  id: integer("id").primaryKey(),
  civitaiVersionId: integer("civitaiVersionId").notNull(),
  name: text("name").notNull(),
  type: text("type"),
  sizeKB: integer("sizeKB").notNull(),
  pickleScanResult: text("pickleScanResult"),
  pickleScanMessage: text("pickleScanMessage"),
  virusScanResult: text("virusScanResult"),
  virusScanMessage: text("virusScanMessage"),
  scannedAt: integer("scannedAt", { mode: "timestamp_ms" }),
  downloadStatus: text("downloadStatus"),
  downloadOutput: text("downloadOutput"),
  downloadUrl: text("downloadUrl").notNull(),
  runpodPath: text("runpodPath").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  runpodJobId: text("runpodJobId"),
});

export const civitaiFilesRelations = relations(civitaiFiles, ({ one }) => ({
  metadata: one(civitaiFilesMetadata, {
    fields: [civitaiFiles.id],
    references: [civitaiFilesMetadata.fileId],
  }),
  modelVersions: one(civitaiModelVersions, {
    fields: [civitaiFiles.civitaiVersionId],
    references: [civitaiModelVersions.id],
  }),
}));

export type SelectCivitaiFile = typeof civitaiFiles.$inferSelect;
export type InsertCivitaiFile = typeof civitaiFiles.$inferInsert;
export type CivitaiFile = typeof civitaiFiles;
