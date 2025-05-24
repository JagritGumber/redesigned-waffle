ALTER TABLE `generator_jobs` RENAME COLUMN "result_payload" TO "image_urls";--> statement-breakpoint
ALTER TABLE `generator_jobs` ADD `generation_info` text;