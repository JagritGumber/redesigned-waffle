CREATE TABLE `civitaiModelInstall` (
  `id` text PRIMARY KEY NOT NULL,
  `userId` text NOT NULL,
  `civitaiModelId` integer NOT NULL,
  `defaultWeight` real DEFAULT 0.6,
  `status` text DEFAULT 'READY',
  `runpodJobId` text,
  `civitaiFileId` integer,
  `runpodPath` text,
  `statusMessage` text,
  `buildTriggerId` text,
  `imageName` text,
  `downloadCompletedAt` integer,
  `buildTriggeredAt` integer,
  `deployedAt` integer,
  `createdAt` integer,
  `updatedAt` integer,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`civitaiModelId`) REFERENCES `civitaiModel`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `civitaiModelInstall_user_model_unique` ON `civitaiModelInstall` (`userId`,`civitaiModelId`);
INSERT INTO `civitaiModelInstall` (
  `id`,
  `userId`,
  `civitaiModelId`,
  `defaultWeight`,
  `status`,
  `runpodJobId`,
  `statusMessage`,
  `buildTriggerId`,
  `imageName`,
  `buildTriggeredAt`,
  `deployedAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
  `userId`,
  `id`,
  `defaultWeight`,
  `status`,
  `runpodJobId`,
  `statusMessage`,
  `buildTriggerId`,
  `imageName`,
  `buildTriggeredAt`,
  `deployedAt`,
  `createdAt`,
  `updatedAt`
FROM `civitaiModel`
WHERE `userId` IS NOT NULL;
