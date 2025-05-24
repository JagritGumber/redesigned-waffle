import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const civitaiCreator = sqliteTable("civitaiCreator", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().unique(),
  image: text("image"),
  modelCount: integer("modelCount"),
  link: text("link"),
});

export type InsertCivitaiCreator = typeof civitaiCreator.$inferInsert;
