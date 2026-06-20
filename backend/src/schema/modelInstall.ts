import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { civitaiModels } from "./models";
import users from "./users";

export const civitaiModelInstalls = sqliteTable(
  "civitaiModelInstall",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    civitaiModelId: integer("civitaiModelId")
      .notNull()
      .references(() => civitaiModels.id, { onDelete: "cascade" }),
    defaultWeight: real("defaultWeight").default(0.6),
    status: text("status").default("READY"),
    runpodJobId: text("runpodJobId"),
    civitaiFileId: integer("civitaiFileId"),
    runpodPath: text("runpodPath"),
    statusMessage: text("statusMessage"),
    buildTriggerId: text("buildTriggerId"),
    imageName: text("imageName"),
    downloadCompletedAt: integer("downloadCompletedAt", { mode: "timestamp_ms" }),
    buildTriggeredAt: integer("buildTriggeredAt", { mode: "timestamp_ms" }),
    deployedAt: integer("deployedAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userModelUnique: uniqueIndex("civitaiModelInstall_user_model_unique").on(
      table.userId,
      table.civitaiModelId,
    ),
  }),
);

export const civitaiModelInstallsRelations = relations(civitaiModelInstalls, ({ one }) => ({
  user: one(users, {
    fields: [civitaiModelInstalls.userId],
    references: [users.id],
  }),
  model: one(civitaiModels, {
    fields: [civitaiModelInstalls.civitaiModelId],
    references: [civitaiModels.id],
  }),
}));

export type SelectCivitaiModelInstall = typeof civitaiModelInstalls.$inferSelect;
export type InsertCivitaiModelInstall = typeof civitaiModelInstalls.$inferInsert;
