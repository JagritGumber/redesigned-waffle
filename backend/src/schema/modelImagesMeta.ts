import { relations } from "drizzle-orm";
import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { civitaiImages } from "./modelImages";

export const civitaiImagesMeta = sqliteTable("modelImageMeta", {
  id: integer("id").primaryKey(),
});

export const modelImageMetaRelations = relations(civitaiImagesMeta, ({ one }) => ({
  // <-- Use 'many' here
  images: one(civitaiImages, {
    // <-- Name it appropriately, use civitaiImages
    fields: [civitaiImagesMeta.id], // <-- Use this table's ID
    references: [civitaiImages.metaId], // <-- Reference the foreign key in the other table
  }),
}));
