ALTER TABLE `generator_jobs` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
ALTER TABLE `postTemplates` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
