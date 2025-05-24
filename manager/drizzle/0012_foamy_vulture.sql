CREATE TABLE `scraped_posts` (
	`id` integer PRIMARY KEY NOT NULL,
	`rating` text NOT NULL,
	`tag_string_general` text NOT NULL,
	`created_at` integer NOT NULL,
	`score` integer NOT NULL,
	`fav_count` integer NOT NULL,
	`file_ext` text NOT NULL,
	`file_size` integer NOT NULL,
	`image_width` integer NOT NULL,
	`image_height` integer NOT NULL,
	`stored_at` integer NOT NULL
);
