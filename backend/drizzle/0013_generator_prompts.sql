CREATE TABLE `generator_prompts` (
  `id` text PRIMARY KEY NOT NULL,
  `runpod_job_id` text,
  `userId` text REFERENCES `user`(`id`) ON DELETE cascade,
  `status` text NOT NULL,
  `input_payload` text NOT NULL,
  `output_payload` text,
  `error_message` text,
  `error_details` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer
);
