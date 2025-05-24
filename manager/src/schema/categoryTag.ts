import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { categories } from "./category";
import { tags } from "./tags";
import { relations } from "drizzle-orm";

export const categoryTag = sqliteTable("categoryTag", {
  // Define columns, link via foreignKey constraints below
  categoryId: integer("categoryId")
    .notNull()
    .references(() => categories.id),
  tagId: integer("tagId")
    .notNull()
    .references(() => tags.id),
});

export const categoryTagRelations = relations(categoryTag, ({ one }) => ({
  tag: one(tags, {
    fields: [categoryTag.tagId],
    references: [tags.id],
  }),
  category: one(categories, {
    fields: [categoryTag.categoryId],
    references: [categories.id],
  }),
}));

export type InsertCategoryTag = typeof categoryTag.$inferInsert;
export type SelectCategoryTag = typeof categoryTag.$inferSelect;
