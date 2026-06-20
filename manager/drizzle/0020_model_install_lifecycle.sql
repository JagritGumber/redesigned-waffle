ALTER TABLE `civitaiModelInstall` ADD `civitaiFileId` integer;
--> statement-breakpoint
ALTER TABLE `civitaiModelInstall` ADD `runpodPath` text;
--> statement-breakpoint
ALTER TABLE `civitaiModelInstall` ADD `statusMessage` text;
--> statement-breakpoint
ALTER TABLE `civitaiModelInstall` ADD `buildTriggerId` text;
--> statement-breakpoint
ALTER TABLE `civitaiModelInstall` ADD `downloadCompletedAt` integer;
--> statement-breakpoint
ALTER TABLE `civitaiModelInstall` ADD `buildTriggeredAt` integer;
--> statement-breakpoint
ALTER TABLE `civitaiModelInstall` ADD `deployedAt` integer;
