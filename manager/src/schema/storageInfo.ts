// src/schema/storageInfo.ts
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const storageInfo = sqliteTable("storage_info", {
  id: integer("id").primaryKey(), // You can keep it as integer, or use text if you prefer
  totalStorageBytes: integer("total_storage_bytes").notNull().default(0),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export type StorageInfo = typeof storageInfo.$inferSelect; // Return type for select queries
export type NewStorageInfo = typeof storageInfo.$inferInsert; // Return type for insert/update queries
