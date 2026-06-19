ALTER TABLE `civitaiModel` ADD `userId` text REFERENCES `user`(`id`) ON DELETE cascade;
