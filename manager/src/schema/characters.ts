import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const character = sqliteTable("character", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  name: text("name").notNull(),
  from: text("from").notNull(), // Some description about where they are from
  why: text("why").$type<"winner" | "random">(),
  status: text("status")
    .$type<"done" | "not_done">()
    .notNull()
    .default("not_done"),
});

export type InsertCharacter = typeof character.$inferInsert;
export type SelectCharacter = typeof character.$inferSelect;
