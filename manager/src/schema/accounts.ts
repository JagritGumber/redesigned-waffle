// ./schema/accounts.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { AdapterAccountType } from "@auth/core/adapters";
import { relations } from "drizzle-orm";

export const accounts = sqliteTable("account", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccountType>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export default accounts;
