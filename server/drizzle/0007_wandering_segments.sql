-- Phase 12: rail, coach and ferry become first-class journeys (PLAN-V3 §3a).
--
-- Hand-written. drizzle-kit cannot tell a rename from a drop-and-add, and on
-- live data the difference is every existing flight. SQLite's RENAME is a
-- catalogue edit — no table copy, no risk of a partial move — so this is both
-- the safest and the cheapest way to do it.
--
-- `mode` defaults to 'air' precisely because every row that exists today is a
-- flight; the default is the backfill.
ALTER TABLE `flights` RENAME TO `segments`;
--> statement-breakpoint
ALTER TABLE `segments` RENAME COLUMN `airline` TO `carrier`;
--> statement-breakpoint
ALTER TABLE `segments` RENAME COLUMN `flight_number` TO `service`;
--> statement-breakpoint
ALTER TABLE `segments` RENAME COLUMN `departure_airport` TO `origin`;
--> statement-breakpoint
ALTER TABLE `segments` RENAME COLUMN `arrival_airport` TO `destination`;
--> statement-breakpoint
ALTER TABLE `segments` ADD `mode` text DEFAULT 'air' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `flights_trip_idx`;
--> statement-breakpoint
CREATE INDEX `segments_trip_idx` ON `segments` (`trip_id`,`departure_at`);
--> statement-breakpoint
-- Pending reminders name the thing they are about. Left alone they would point
-- at a type nothing produces any more, and the sweep would render them with the
-- wrong verb.
UPDATE `reminders` SET `related_type` = 'segment' WHERE `related_type` = 'flight';
--> statement-breakpoint
-- Imports awaiting review name the kind they propose. An unmigrated 'flight'
-- would send the reviewer to a route that no longer exists.
UPDATE `booking_imports` SET `extracted_type` = 'segment' WHERE `extracted_type` = 'flight';
