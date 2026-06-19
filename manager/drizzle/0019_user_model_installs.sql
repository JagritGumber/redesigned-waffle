CREATE TABLE `civitaiModelInstall` (
  `id` text PRIMARY KEY NOT NULL,
  `userId` text NOT NULL,
  `civitaiModelId` integer NOT NULL,
  `defaultWeight` real DEFAULT 0.6,
  `status` text DEFAULT 'READY',
  `runpodJobId` text,
  `createdAt` integer,
  `updatedAt` integer,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`civitaiModelId`) REFERENCES `civitaiModel`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `civitaiModelInstall_user_model_unique` ON `civitaiModelInstall` (`userId`,`civitaiModelId`);
