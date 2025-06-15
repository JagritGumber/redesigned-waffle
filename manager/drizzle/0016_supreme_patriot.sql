CREATE TABLE `post_image_details` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`platform` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tags` text,
	`tier` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `generator_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
