import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { civitaiModels } from "./models";
import { relations } from "drizzle-orm";
import { civitaiFiles, SelectCivitaiFile } from "./modelFiles";
import { civitaiImages, SelectCivitaiImage } from "./modelImages";

export const civitaiModelVersions = sqliteTable("civitaiModelVersion", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  downloadUrl: text("downloadUrl").notNull(),
  trainedWords: text("trainedWords", { mode: "json" }).$type<string[]>(),
  civitaiModelId: integer("civitaiModelId")
    .notNull()
    .references(() => civitaiModels.id),
  index: integer("index"),
  baseModel: text("baseModel"),
  baseModelType: text("baseModelType"),
  publishedAt: text("publishedAt"), // Consider using integer for timestamp if needed
  availability: text("availability"),
  nsfwLevel: integer("nsfwLevel"),
  supportsGeneration: integer("supportsGeneration", { mode: "boolean" }),
  statsDownloadCount: integer("statsDownloadCount"),
  statsFavoriteCount: integer("statsFavoriteCount"),
  statsRating: real("statsRating"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
});

export const civitaiModelVersionsRelations = relations(
  civitaiModelVersions,
  ({ one, many }) => ({
    model: one(civitaiModels, {
      fields: [civitaiModelVersions.civitaiModelId],
      references: [civitaiModels.id],
    }),
    files: many(civitaiFiles),
    images: many(civitaiImages),
  })
);

export type SelectCivitaiModelVersion =
  typeof civitaiModelVersions.$inferSelect;
export type InsertCivitaiModelVersion =
  typeof civitaiModelVersions.$inferInsert;
export type CivitaiModelVersion = typeof civitaiModelVersions;

export type CivitaiModelVersionWithFilesAndImages = Omit<
  SelectCivitaiModelVersion,
  "civitaiModelId"
> & {
  files: SelectCivitaiFile[];
  images: SelectCivitaiImage[];
};
