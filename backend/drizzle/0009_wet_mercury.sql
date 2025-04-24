ALTER TABLE `civitaiImage` ADD `prompt` text;--> statement-breakpoint
ALTER TABLE `civitaiImage` ADD `negativePrompt` text;--> statement-breakpoint
ALTER TABLE `civitaiImage` ADD `seed` integer;--> statement-breakpoint
ALTER TABLE `civitaiImage` ADD `steps` integer;--> statement-breakpoint
ALTER TABLE `civitaiImage` ADD `cfgScale` real;--> statement-breakpoint
ALTER TABLE `civitaiImage` ADD `sampler` text;--> statement-breakpoint
ALTER TABLE `civitaiImage` ADD `clipSkip` integer;