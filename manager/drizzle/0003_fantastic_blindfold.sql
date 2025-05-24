CREATE TABLE `postTemplates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`options` text DEFAULT '[]',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
