CREATE TABLE `booking_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trip_id` text,
	`resend_message_id` text NOT NULL,
	`from_address` text NOT NULL,
	`subject` text NOT NULL,
	`received_at` text NOT NULL,
	`status` text NOT NULL,
	`extracted_type` text,
	`extracted_fields` text,
	`parsed_by` text,
	`error_message` text,
	`processed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_imports_resend_message_id_unique` ON `booking_imports` (`resend_message_id`);--> statement-breakpoint
CREATE INDEX `booking_imports_user_idx` ON `booking_imports` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `booking_imports_trip_idx` ON `booking_imports` (`trip_id`);