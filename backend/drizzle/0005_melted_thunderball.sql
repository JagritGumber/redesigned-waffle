PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_postTemplates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`image_keys` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_postTemplates`("id", "name", "type", "title", "description", "options", "image_keys", "created_at") SELECT "id", "name", "type", "title", "description", "options", "image_keys", "created_at" FROM `postTemplates`;--> statement-breakpoint
DROP TABLE `postTemplates`;--> statement-breakpoint
ALTER TABLE `__new_postTemplates` RENAME TO `postTemplates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;