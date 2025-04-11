// ./schema/groups.ts
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { accounts } from "./accounts";
import { relations } from "drizzle-orm";

export const groups = sqliteTable("group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  patreonAccountId: integer("patreonAccountId")
    .references(() => accounts.id)
    .unique(),
  deviantartAccountId: integer("deviantartAccountId")
    .references(() => accounts.id)
    .unique(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export type SelectGroup = typeof groups.$inferSelect;
export type InsertGroup = typeof groups.$inferInsert;
export type Group = typeof groups;

export const groupsRelations = relations(groups, ({ one }) => ({
  user: one(users, {
    fields: [groups.userId],
    references: [users.id],
  }),
  patreonAccount: one(accounts, {
    fields: [groups.patreonAccountId],
    references: [accounts.id],
  }),
  deviantartAccount: one(accounts, {
    fields: [groups.deviantartAccountId],
    references: [accounts.id],
  }),
}));

export default groups;
