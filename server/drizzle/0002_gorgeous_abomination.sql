CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`related_type` text NOT NULL,
	`related_id` text NOT NULL,
	`origin` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`remind_at` text NOT NULL,
	`claimed_at` text,
	`sent_at` text,
	`failed_at` text,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`remind_at`,`claimed_at`);--> statement-breakpoint
CREATE INDEX `reminders_related_idx` ON `reminders` (`related_type`,`related_id`);--> statement-breakpoint
CREATE INDEX `reminders_user_idx` ON `reminders` (`user_id`);