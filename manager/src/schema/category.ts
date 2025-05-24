import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { categoryTag } from "./categoryTag";
import { relationshipWeights } from "./relationshipWeights";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().unique(), // e.g., "Position", "Laying Down", "Clothes - Upper Body"
  description: text("description"),
  parentId: integer("parentId"),
  level: integer("level").notNull().default(1),
  selectionRule: text("selectionRule", {
    enum: ["pick_one", "pick_multiple", "pick_all", "mandatory", "optional", "group_only"],
  })
    .notNull()
    .default("mandatory"),
  isGroup: integer("isGroup", { mode: "boolean" }).notNull().default(false),
  promptTemplatePart: text("promptTemplatePart"),
});

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "categoryParent", // Give a unique name to self-reference
  }),
  children: many(categories, {
    relationName: "categoryParent", // Children side must use the same name
  }),
  categoryTags: many(categoryTag),
  sourceRelationships: many(relationshipWeights),
}));

export type InsertCategory = typeof categories.$inferInsert;
export type SelectCategory = typeof categories.$inferSelect;
