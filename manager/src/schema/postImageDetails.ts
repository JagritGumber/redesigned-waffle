import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { generatorJobs } from "./generatorJob";
import users from "./users";

export const postImageDetails = sqliteTable("post_image_details", {
  id: text("id")
    .notNull()
    .primaryKey()
    .references(() => generatorJobs.id, { onDelete: "cascade" }), // Use imageId as primary key
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["deviantart", "patreon"] }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>(), // Stored as JSON array of strings
  tier: text("tier"), // Optional tier for visibility
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const postImageDetailsRelations = relations(postImageDetails, ({ one }) => ({
  imageJob: one(generatorJobs, {
    fields: [postImageDetails.id], // Reference the primary key 'id' which is also the imageId
    references: [generatorJobs.id],
  }),
}));

export type SelectPostImageDetails = typeof postImageDetails.$inferSelect;
export type InsertPostImageDetails = typeof postImageDetails.$inferInsert;
