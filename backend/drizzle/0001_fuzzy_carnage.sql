CREATE TABLE `civitaiFile` (
	`id` text PRIMARY KEY NOT NULL,
	`civitaiVersionId` text NOT NULL,
	`civitaiFileId` integer NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`sizeKB` integer,
	`pickleScanResult` text,
	`pickleScanMessage` text,
	`virusScanResult` text,
	`virusScanMessage` text,
	`scannedAt` text,
	`metadataFormat` text,
	`metadataSize` text,
	`metadataFp` text,
	`sha256Hash` text,
	`downloadUrl` text NOT NULL,
	`primary` integer,
	`runpodPath` text NOT NULL,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`civitaiVersionId`) REFERENCES `civitaiModelVersion`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiFile_civitaiFileId_unique` ON `civitaiFile` (`civitaiFileId`);--> statement-breakpoint
CREATE TABLE `civitaiModelVersion` (
	`id` text PRIMARY KEY NOT NULL,
	`civitaiModelId` text NOT NULL,
	`civitaiVersionId` integer NOT NULL,
	`index` integer,
	`name` text,
	`baseModel` text,
	`baseModelType` text,
	`publishedAt` text,
	`availability` text,
	`nsfwLevel` integer,
	`description` text,
	`trainedWords` text,
	`supportsGeneration` integer,
	`downloadUrl` text,
	`statsDownloadCount` integer,
	`statsFavoriteCount` integer,
	`statsRating` real,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`civitaiModelId`) REFERENCES `civitaiModel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiModelVersion_civitaiVersionId_unique` ON `civitaiModelVersion` (`civitaiVersionId`);--> statement-breakpoint
CREATE TABLE `civitaiModel` (
	`id` text PRIMARY KEY NOT NULL,
	`civitaiId` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`allowNoCredit` integer,
	`allowCommercialUse` text,
	`allowDerivatives` integer,
	`allowDifferentLicense` integer,
	`nsfw` integer,
	`nsfwLevel` integer,
	`availability` text,
	`supportsGeneration` integer,
	`creatorUsername` text,
	`tags` text,
	`statsDownloadCount` integer,
	`statsFavoriteCount` integer,
	`statsThumbsUpCount` integer,
	`statsThumbsDownCount` integer,
	`statsCommentCount` integer,
	`statsRatingCount` integer,
	`statsRating` real,
	`statsTippedAmountCount` integer,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiModel_civitaiId_unique` ON `civitaiModel` (`civitaiId`);