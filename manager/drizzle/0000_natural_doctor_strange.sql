CREATE TABLE `account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `authenticator` (
	`credentialID` text NOT NULL,
	`userId` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`credentialPublicKey` text NOT NULL,
	`counter` integer NOT NULL,
	`credentialDeviceType` text NOT NULL,
	`credentialBackedUp` integer NOT NULL,
	`transports` text,
	PRIMARY KEY(`userId`, `credentialID`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authenticator_credentialID_unique` ON `authenticator` (`credentialID`);--> statement-breakpoint
CREATE TABLE `civitaiCreator` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`image` text,
	`modelCount` integer,
	`link` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiCreator_username_unique` ON `civitaiCreator` (`username`);--> statement-breakpoint
CREATE TABLE `civitaiFile` (
	`id` integer PRIMARY KEY NOT NULL,
	`civitaiVersionId` integer NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`sizeKB` integer NOT NULL,
	`pickleScanResult` text,
	`pickleScanMessage` text,
	`virusScanResult` text,
	`virusScanMessage` text,
	`scannedAt` integer,
	`downloadStatus` text,
	`downloadOutput` text,
	`downloadUrl` text NOT NULL,
	`runpodPath` text NOT NULL,
	`createdAt` integer,
	`updatedAt` integer,
	`runpodJobId` text
);
--> statement-breakpoint
CREATE TABLE `civitaiFilesMetadata` (
	`id` integer PRIMARY KEY NOT NULL,
	`format` text,
	`size` text,
	`fp` text,
	`fileId` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`fileId`) REFERENCES `civitaiFile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `civitaiImage` (
	`id` integer PRIMARY KEY NOT NULL,
	`civitaiVersionId` integer NOT NULL,
	`index` integer NOT NULL,
	`url` text NOT NULL,
	`nsfw` integer,
	`nsfwLevel` integer NOT NULL,
	`height` integer NOT NULL,
	`width` integer NOT NULL,
	`hash` text NOT NULL,
	`hasMeta` integer,
	`createdAt` integer,
	`metaId` integer,
	`updatedAt` integer,
	FOREIGN KEY (`civitaiVersionId`) REFERENCES `civitaiModelVersion`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`metaId`) REFERENCES `modelImageMeta`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiImage_hash_unique` ON `civitaiImage` (`hash`);--> statement-breakpoint
CREATE TABLE `modelImageMeta` (
	`id` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `civitaiModelVersion` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`downloadUrl` text NOT NULL,
	`trainedWords` text,
	`civitaiModelId` integer NOT NULL,
	`index` integer,
	`baseModel` text,
	`baseModelType` text,
	`publishedAt` text,
	`availability` text,
	`nsfwLevel` integer,
	`supportsGeneration` integer,
	`statsDownloadCount` integer,
	`statsFavoriteCount` integer,
	`statsRating` real,
	`createdAt` integer,
	`updatedAt` integer,
	`required` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`civitaiModelId`) REFERENCES `civitaiModel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `civitaiModel` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`nsfw` integer NOT NULL,
	`tags` text NOT NULL,
	`mode` text,
	`creatorId` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer,
	`defaultWeight` real DEFAULT 0.6,
	`status` text,
	`runpodJobId` text,
	FOREIGN KEY (`creatorId`) REFERENCES `civitaiCreator`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generator_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`runpod_job_id` text,
	`status` text NOT NULL,
	`input_payload` text NOT NULL,
	`result_payload` text,
	`error_message` text,
	`error_details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `group` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`userId` text,
	`patreonAccountId` integer,
	`deviantartAccountId` integer,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patreonAccountId`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deviantartAccountId`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_patreonAccountId_unique` ON `group` (`patreonAccountId`);--> statement-breakpoint
CREATE UNIQUE INDEX `group_deviantartAccountId_unique` ON `group` (`deviantartAccountId`);--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `storage_info` (
	`id` integer PRIMARY KEY NOT NULL,
	`total_storage_bytes` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`password` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
