CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`start_local` text NOT NULL,
	`start_timezone` text NOT NULL,
	`start_at` text NOT NULL,
	`end_local` text,
	`end_timezone` text,
	`end_at` text,
	`confirmation_code` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activities_trip_idx` ON `activities` (`trip_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `flights` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`airline` text NOT NULL,
	`flight_number` text NOT NULL,
	`confirmation_code` text,
	`departure_airport` text NOT NULL,
	`departure_local` text NOT NULL,
	`departure_timezone` text NOT NULL,
	`departure_at` text NOT NULL,
	`arrival_airport` text NOT NULL,
	`arrival_local` text NOT NULL,
	`arrival_timezone` text NOT NULL,
	`arrival_at` text NOT NULL,
	`seat` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flights_trip_idx` ON `flights` (`trip_id`,`departure_at`);--> statement-breakpoint
CREATE TABLE `lodging` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`check_in_local` text NOT NULL,
	`check_in_timezone` text NOT NULL,
	`check_in_at` text NOT NULL,
	`check_out_local` text NOT NULL,
	`check_out_timezone` text NOT NULL,
	`check_out_at` text NOT NULL,
	`confirmation_code` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lodging_trip_idx` ON `lodging` (`trip_id`,`check_in_at`);