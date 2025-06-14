CREATE TABLE `generator_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`runpod_job_id` text,
	`status` text NOT NULL,
	`input_payload` text NOT NULL,
	`output_payload` text,
	`error_message` text,
	`error_details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_training_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_trained_post_id` integer DEFAULT 0 NOT NULL,
	`last_trained_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_training_state`("id", "last_trained_post_id", "last_trained_at") SELECT "id", "last_trained_post_id", "last_trained_at" FROM `training_state`;--> statement-breakpoint
DROP TABLE `training_state`;--> statement-breakpoint
ALTER TABLE `__new_training_state` RENAME TO `training_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;