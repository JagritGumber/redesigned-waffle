// ./schema/civitaiModels.ts
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { ModelState, ModelTypes } from "@/types/models";
import {
  civitaiModelVersions,
  CivitaiModelVersionWithFilesAndImages,
  SelectCivitaiModelVersion,
} from "./modelVersions";
import { civitaiCreator } from "./modelCreator";
import { SelectCivitaiFile } from "./modelFiles";
import { SelectCivitaiImage } from "./modelImages";
import users from "./users";

export const civitaiModels = sqliteTable("civitaiModel", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type", {
    enum: [
      ModelTypes.Checkpoint,
      ModelTypes.TextualInversion,
      ModelTypes.Hypernetwork,
      ModelTypes.AestheticGradient,
      ModelTypes.LORA,
      ModelTypes.Controlnet,
      ModelTypes.Poses,
    ],
  }).notNull(),
  nsfw: integer("nsfw", { mode: "boolean" }).notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  mode: text("mode", {
    enum: [ModelState.Archived, ModelState.TakenDown],
  }),
  creatorId: integer("creatorId")
    .references(() => civitaiCreator.id)
    .notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  defaultWeight: real("defaultWeight").default(0.6), // Added the defaultWeight field
  status: text("status"),
  runpodJobId: text("runpodJobId"),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
});

export const civitaiModelsRelations = relations(
  civitaiModels,
  ({ many, one }) => ({
    modelVersions: many(civitaiModelVersions),
    creator: one(civitaiCreator),
    user: one(users, {
      fields: [civitaiModels.userId],
      references: [users.id],
    }),
  })
);

export type SelectCivitaiModel = typeof civitaiModels.$inferSelect;
export type InsertCivitaiModel = typeof civitaiModels.$inferInsert;
export type CivitaiModel = typeof civitaiModels;

export interface CivitaiModelWithRelations extends SelectCivitaiModel {
  modelVersions: CivitaiModelVersionWithFilesAndImages[];
}
