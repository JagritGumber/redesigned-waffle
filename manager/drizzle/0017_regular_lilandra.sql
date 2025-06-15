PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_post_image_details` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tags` text,
	`tier` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `generator_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_post_image_details`("id", "platform", "title", "description", "tags", "tier", "created_at", "updated_at") SELECT "id", "platform", "title", "description", "tags", "tier", "created_at", "updated_at" FROM `post_image_details`;--> statement-breakpoint
DROP TABLE `post_image_details`;--> statement-breakpoint
ALTER TABLE `__new_post_image_details` RENAME TO `post_image_details`;--> statement-breakpoint
PRAGMA foreign_keys=ON;