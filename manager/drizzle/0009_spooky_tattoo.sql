CREATE TABLE `tagCorrelations` (
	`tag1Id` integer NOT NULL,
	`tag2Id` integer NOT NULL,
	`correlationWeight` real NOT NULL,
	FOREIGN KEY (`tag1Id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag2Id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
