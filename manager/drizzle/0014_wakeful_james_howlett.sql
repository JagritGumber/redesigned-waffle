CREATE TABLE `training_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_trained_post_id` integer DEFAULT 0 NOT NULL,
	`last_trained_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
