import { integer, real, sqliteTable } from "drizzle-orm/sqlite-core";
import { tags } from "./tags";
import { relations } from "drizzle-orm";

export const tagCorrelations = sqliteTable("tagCorrelations", {
  // Tag 1 ID (Foreign Key referencing tags.id)
  tag1Id: integer("tag1Id")
    .notNull()
    .references(() => tags.id),

  // Tag 2 ID (Foreign Key referencing tags.id)
  tag2Id: integer("tag2Id")
    .notNull()
    .references(() => tags.id),

  // The calculated correlation weight (e.g., PMI score) between tag1 and tag2.
  // Higher weight means stronger positive association.
  correlationWeight: real("correlationWeight").notNull(),
});

export const tagCorrelationsRelations = relations(tagCorrelations, ({ one }) => ({
  // Relation back to Tag 1
  tag1: one(tags, {
    fields: [tagCorrelations.tag1Id],
    references: [tags.id],
    relationName: "correlation1", // Give unique relation names
  }),
  // Relation back to Tag 2
  tag2: one(tags, {
    fields: [tagCorrelations.tag2Id],
    references: [tags.id],
    relationName: "correlation2", // Give unique relation names
  }),
}));

export type SelectTagCorrelation = typeof tagCorrelations.$inferSelect;
export type InsertTagCorrelation = typeof tagCorrelations.$inferInsert;
