PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_civitaiImage` (
	`id` text PRIMARY KEY NOT NULL,
	`civitaiVersionId` text NOT NULL,
	`url` text NOT NULL,
	`nsfwLevel` integer,
	`width` integer,
	`height` integer,
	`hash` text NOT NULL,
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
INSERT INTO `__new_civitaiImage`("id", "civitaiVersionId", "url", "nsfwLevel", "width", "height", "hash", "type", "hasMeta", "hasPositivePrompt", "onSite", "remixOfId", "createdAt", "updatedAt") SELECT "id", "civitaiVersionId", "url", "nsfwLevel", "width", "height", "hash", "type", "hasMeta", "hasPositivePrompt", "onSite", "remixOfId", "createdAt", "updatedAt" FROM `civitaiImage`;--> statement-breakpoint
DROP TABLE `civitaiImage`;--> statement-breakpoint
ALTER TABLE `__new_civitaiImage` RENAME TO `civitaiImage`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiImage_hash_unique` ON `civitaiImage` (`hash`);