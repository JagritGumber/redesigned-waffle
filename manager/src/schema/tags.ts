import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { categoryTag } from "./categoryTag";
import { relationshipWeights } from "./relationshipWeights";

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey(),
  tagText: text("tagText").notNull().unique(),
  description: text("description"),
  baseWeight: real("baseWeight").notNull().default(1.0),
  formalLevelBias: text("formalLevelBias", { mode: "json" }).$type<Record<string, number>>(),
});

export const tagsRelations = relations(tags, ({ many }) => ({
  categoryTags: many(categoryTag),
  targetRelationships: many(relationshipWeights),
}));

export type InsertTag = typeof tags.$inferInsert;
export type SelectTag = typeof tags.$inferSelect;
