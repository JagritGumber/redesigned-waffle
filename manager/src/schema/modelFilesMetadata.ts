import { relations } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { civitaiFiles } from "./modelFiles";

export const civitaiFilesMetadata = sqliteTable("civitaiFilesMetadata", {
  id: integer("id").primaryKey(),
  format: text("format"),
  size: text("size"),
  fp: text("fp"),
  fileId: integer("fileId") // <--- This is the FK
    .references(() => civitaiFiles.id)
    .notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const civitaiFilesMetadataRelations = relations(
  civitaiFilesMetadata,
  ({ one }) => ({
    file: one(civitaiFiles),
  })
);

export type SelectCivitaiFileMetadata =
  typeof civitaiFilesMetadata.$inferSelect;
export type InsertCivitaiFileMetadata =
  typeof civitaiFilesMetadata.$inferInsert;
export type CivitaiFileMetadata = typeof civitaiFilesMetadata;
