import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { civitaiModelVersions } from "./modelVersions";
import { relations } from "drizzle-orm";
import { civitaiImagesMeta } from "./modelImagesMeta";

export const civitaiImages = sqliteTable("civitaiImage", {
  id: integer("id").primaryKey(),
  civitaiVersionId: integer("civitaiVersionId")
    .notNull()
    .references(() => civitaiModelVersions.id),
  index: integer("index").notNull(),
  url: text("url").notNull(),
  nsfw: integer("nsfw", { mode: "boolean" }),
  nsfwLevel: integer("nsfwLevel").notNull(),
  height: integer("height").notNull(),
  width: integer("width").notNull(),
  hash: text("hash").notNull().unique(),
  hasMeta: integer("hasMeta", { mode: "boolean" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  metaId: integer("metaId").references(() => civitaiImagesMeta.id),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const civitaiImagesRelations = relations(civitaiImages, ({ one }) => ({
  version: one(civitaiModelVersions, {
    fields: [civitaiImages.civitaiVersionId],
    references: [civitaiModelVersions.id],
  }),
  metadata: one(civitaiImagesMeta, {
    fields: [civitaiImages.metaId],
    references: [civitaiImagesMeta.id],
  }),
}));

export type SelectCivitaiImage = typeof civitaiImages.$inferSelect;
export type InsertCivitaiImage = typeof civitaiImages.$inferInsert;
export type CivitaiImage = typeof civitaiImages;
