CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parentId` integer,
	`level` integer DEFAULT 1 NOT NULL,
	`selectionRule` text DEFAULT 'mandatory' NOT NULL,
	`isGroup` integer DEFAULT false NOT NULL,
	`promptTemplatePart` text
);
--> statement-breakpoint
CREATE TABLE `categoryTag` (
	`categoryId` integer NOT NULL,
	`tagId` integer NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relationshipWeights` (
	`sourceCategoryId` integer NOT NULL,
	`targetTagId` integer NOT NULL,
	`weight` real NOT NULL,
	FOREIGN KEY (`sourceCategoryId`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`targetTagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`tagText` text NOT NULL,
	`description` text,
	`baseWeight` real DEFAULT 1 NOT NULL,
	`formalLevelBias` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_tagText_unique` ON `tags` (`tagText`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_character` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`from` text NOT NULL,
	`why` text,
	`status` text DEFAULT 'not_done' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_character`("id", "name", "from", "why", "status") SELECT "id", "name", "from", "why", "status" FROM `character`;--> statement-breakpoint
DROP TABLE `character`;--> statement-breakpoint
ALTER TABLE `__new_character` RENAME TO `character`;--> statement-breakpoint
PRAGMA foreign_keys=ON;