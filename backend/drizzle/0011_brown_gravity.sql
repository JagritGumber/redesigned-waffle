PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generator_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`runpod_job_id` text,
	`status` text NOT NULL,
	`input_payload` text NOT NULL,
	`result_payload` text,
	`error_message` text,
	`error_details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_generator_jobs`("id", "runpod_job_id", "status", "input_payload", "result_payload", "error_message", "error_details", "created_at", "updated_at", "completed_at") SELECT "id", "runpod_job_id", "status", "input_payload", "result_payload", "error_message", "error_details", "created_at", "updated_at", "completed_at" FROM `generator_jobs`;--> statement-breakpoint
DROP TABLE `generator_jobs`;--> statement-breakpoint
ALTER TABLE `__new_generator_jobs` RENAME TO `generator_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;