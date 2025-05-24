import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { tags } from "./tags";

export const relationshipWeights = sqliteTable(
  "relationshipWeights",
  {
    sourceTagId: integer("sourceTagId")
      .notNull()
      .references(() => tags.id),
    targetTagId: integer("targetTagId")
      .notNull()
      .references(() => tags.id),

    weight: real("weight").notNull(),
  },
  (t) => [unique().on(t.sourceTagId, t.targetTagId)],
);

export const relationshipWeightsRelations = relations(relationshipWeights, ({ one }) => ({
  sourceCategory: one(tags, {
    fields: [relationshipWeights.sourceTagId],
    references: [tags.id],
    relationName: "sourceRelationships",
  }),
  targetTag: one(tags, {
    fields: [relationshipWeights.targetTagId],
    references: [tags.id],
    relationName: "targetRelationships",
  }),
}));

export type InsertRelationshipWeights = typeof relationshipWeights.$inferInsert;
export type SelectRelationshipWeights = typeof relationshipWeights.$inferSelect;
