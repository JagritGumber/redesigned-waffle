CREATE TABLE `civitaiImage` (
	`id` text PRIMARY KEY NOT NULL,
	`civitaiVersionId` text NOT NULL,
	`imageId` integer NOT NULL,
	`url` text NOT NULL,
	`nsfwLevel` integer,
	`width` integer,
	`height` integer,
	`hash` text,
	`type` text,
	`hasMeta` integer,
	`hasPositivePrompt` integer,
	`onSite` integer,
	`remixOfId` integer,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`civitaiVersionId`) REFERENCES `civitaiModelVersion`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiImage_imageId_unique` ON `civitaiImage` (`imageId`);