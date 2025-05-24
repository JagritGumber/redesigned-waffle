import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scrapedPosts = sqliteTable("scraped_posts", {
	// Danbooru Post ID: Use integer assuming it fits (up to ~2 billion). Use bigint if needed.
	id: integer("id").primaryKey().notNull(),

	// Rating: 'g', 's', 'q', 'e'
	rating: text("rating").$type<"g" | "s" | "q" | "e">().notNull(),

	// General Tags as a single string
	tagStringGeneral: text("tag_string_general").notNull(),

	// Other potentially useful fields from the API response
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), // Danbooru's creation time
	score: integer("score").notNull(),
	favCount: integer("fav_count").notNull(),
	fileExt: text("file_ext").notNull(), // e.g., 'png', 'jpg'
	fileSize: integer("file_size").notNull(),
	imageWidth: integer("image_width").notNull(),
	imageHeight: integer("image_height").notNull(),

	// When we stored this post
	storedAt: integer("stored_at", { mode: "timestamp_ms" })
		.notNull()
		.$default(() => new Date()),
});
