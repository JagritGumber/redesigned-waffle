PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_relationshipWeights` (
	`sourceTagId` integer NOT NULL,
	`targetTagId` integer NOT NULL,
	`weight` real NOT NULL,
	FOREIGN KEY (`sourceTagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`targetTagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_relationshipWeights`("sourceTagId", "targetTagId", "weight") SELECT "sourceTagId", "targetTagId", "weight" FROM `relationshipWeights`;--> statement-breakpoint
DROP TABLE `relationshipWeights`;--> statement-breakpoint
ALTER TABLE `__new_relationshipWeights` RENAME TO `relationshipWeights`;--> statement-breakpoint
PRAGMA foreign_keys=ON;