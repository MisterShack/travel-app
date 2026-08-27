CREATE TABLE `passes` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`related_type` text,
	`related_id` text,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`data` blob NOT NULL,
	`label` text,
	`barcode_message` text,
	`barcode_format` text,
	`source` text DEFAULT 'upload' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passes_trip_idx` ON `passes` (`trip_id`);--> statement-breakpoint
CREATE INDEX `passes_related_idx` ON `passes` (`related_type`,`related_id`);