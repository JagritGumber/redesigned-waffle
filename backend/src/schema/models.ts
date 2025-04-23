// ./schema/civitaiModels.ts
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const civitaiModels = sqliteTable("civitaiModel", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  civitaiId: integer("civitaiId").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "Checkpoint",
      "TextualInversion",
      "Hypernetwork",
      "AestheticGradient",
      "LORA",
      "Controlnet",
      "Poses",
    ],
  }).notNull(),
  description: text("description"),
  allowNoCredit: integer("allowNoCredit", { mode: "boolean" }),
  allowCommercialUse: text("allowCommercialUse"), // Could be JSON string of the array
  allowDerivatives: integer("allowDerivatives", { mode: "boolean" }),
  allowDifferentLicense: integer("allowDifferentLicense", { mode: "boolean" }),
  nsfw: integer("nsfw", { mode: "boolean" }),
  nsfwLevel: integer("nsfwLevel"),
  availability: text("availability"),
  supportsGeneration: integer("supportsGeneration", { mode: "boolean" }),
  creatorUsername: text("creatorUsername"),
  tags: text("tags"), // Could be JSON string of the array
  statsDownloadCount: integer("statsDownloadCount"),
  statsFavoriteCount: integer("statsFavoriteCount"),
  statsThumbsUpCount: integer("statsThumbsUpCount"),
  statsThumbsDownCount: integer("statsThumbsDownCount"),
  statsCommentCount: integer("statsCommentCount"),
  statsRatingCount: integer("statsRatingCount"),
  statsRating: real("statsRating"),
  statsTippedAmountCount: integer("statsTippedAmountCount"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  defaultWeight: real("defaultWeight").default(0.6), // Added the defaultWeight field
  status: text("status"),
  runpodJobId: text("runpodJobId"),
});

export const civitaiModelsRelations = relations(civitaiModels, ({ many }) => ({
  versions: many(civitaiModelVersions),
}));

export type SelectCivitaiModel = typeof civitaiModels.$inferSelect;
export type InsertCivitaiModel = typeof civitaiModels.$inferInsert;
export type CivitaiModel = typeof civitaiModels;

export const civitaiModelVersions = sqliteTable("civitaiModelVersion", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  civitaiModelId: text("civitaiModelId")
    .notNull()
    .references(() => civitaiModels.id),
  civitaiVersionId: integer("civitaiVersionId").notNull().unique(),
  index: integer("index"),
  name: text("name"),
  baseModel: text("baseModel"),
  baseModelType: text("baseModelType"),
  publishedAt: text("publishedAt"), // Consider using integer for timestamp if needed
  availability: text("availability"),
  nsfwLevel: integer("nsfwLevel"),
  description: text("description"),
  trainedWords: text("trainedWords"), // Could be JSON string of the array
  supportsGeneration: integer("supportsGeneration", { mode: "boolean" }),
  downloadUrl: text("downloadUrl"), // Download URL for this version (likely primary file)
  statsDownloadCount: integer("statsDownloadCount"),
  statsFavoriteCount: integer("statsFavoriteCount"),
  statsRating: real("statsRating"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
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

export const civitaiFiles = sqliteTable("civitaiFile", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  civitaiVersionId: text("civitaiVersionId")
    .notNull()
    .references(() => civitaiModelVersions.id),
  civitaiFileId: integer("civitaiFileId").notNull().unique(),
  name: text("name").notNull(),
  type: text("type"),
  sizeKB: integer("sizeKB"),
  pickleScanResult: text("pickleScanResult"),
  pickleScanMessage: text("pickleScanMessage"),
  virusScanResult: text("virusScanResult"),
  virusScanMessage: text("virusScanMessage"),
  scannedAt: text("scannedAt"), // Consider using integer for timestamp if needed
  metadataFormat: text("metadataFormat"),
  metadataSize: text("metadataSize"),
  metadataFp: text("metadataFp"),
  sha256Hash: text("sha256Hash"),
  downloadStatus: text("downloadStatus"),
  downloadOutput: text("downloadOutput"),
  downloadUrl: text("downloadUrl").notNull(),
  primary: integer("primary", { mode: "boolean" }),
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
  version: one(civitaiModelVersions, {
    fields: [civitaiFiles.civitaiVersionId],
    references: [civitaiModelVersions.id],
  }),
}));

export type SelectCivitaiFile = typeof civitaiFiles.$inferSelect;
export type InsertCivitaiFile = typeof civitaiFiles.$inferInsert;
export type CivitaiFile = typeof civitaiFiles;

export const civitaiImages = sqliteTable("civitaiImage", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  civitaiVersionId: text("civitaiVersionId")
    .notNull()
    .references(() => civitaiModelVersions.id),
  imageId: integer("imageId").notNull().unique(),
  url: text("url").notNull(),
  nsfwLevel: integer("nsfwLevel"),
  width: integer("width"),
  height: integer("height"),
  hash: text("hash"),
  type: text("type"),
  hasMeta: integer("hasMeta", { mode: "boolean" }),
  hasPositivePrompt: integer("hasPositivePrompt", { mode: "boolean" }),
  onSite: integer("onSite", { mode: "boolean" }),
  remixOfId: integer("remixOfId"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const civitaiImagesRelations = relations(civitaiImages, ({ one }) => ({
  version: one(civitaiModelVersions, {
    fields: [civitaiImages.civitaiVersionId],
    references: [civitaiModelVersions.id],
  }),
}));

export type SelectCivitaiImage = typeof civitaiImages.$inferSelect;
export type InsertCivitaiImage = typeof civitaiImages.$inferInsert;
export type CivitaiImage = typeof civitaiImages;

export interface CivitaiModelWithRelations extends SelectCivitaiModel {
  versions: (Omit<SelectCivitaiModelVersion, "civitaiModelId"> & {
    files: SelectCivitaiFile[];
    images: SelectCivitaiImage[];
  })[];
}
