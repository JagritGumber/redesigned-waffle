import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const postTypeEnum = ["text", "poll"] as const;
export type PostType = (typeof postTypeEnum)[number];

export const postTemplates = sqliteTable("postTemplates", {
  id: text("id")
    .$default(() => crypto.randomUUID())
    .primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: postTypeEnum }).notNull(),
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  options: text("options", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]), // Store poll options as JSON array of strings
  imageKeys: text("image_keys").notNull().$type<string[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$default(() => new Date())
    .notNull(),
  updatedAt: integer("created_at", { mode: "timestamp_ms" })
    .$default(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});

// You can optionally export types derived from the schema for use in your application
export type SelectPostTemplate = typeof postTemplates.$inferSelect;
export type InsertPostTemplate = typeof postTemplates.$inferInsert;
