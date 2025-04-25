CREATE TABLE `generator_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`runpod_job_id` text,
	`status` text NOT NULL,
	`input_payload` blob NOT NULL,
	`result_payload` blob,
	`error_message` text,
	`error_details` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
