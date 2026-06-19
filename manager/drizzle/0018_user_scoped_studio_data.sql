ALTER TABLE `generator_jobs` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
ALTER TABLE `generator_prompts` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
ALTER TABLE `postTemplates` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
ALTER TABLE `post_image_details` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
