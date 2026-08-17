-- Carry every existing seat across before the column that held it goes away.
--
-- Hand-written: drizzle-kit generates only the DROP, which on live data is a
-- silent loss of every seat already recorded. The backfill must run first and
-- in the same migration, or a deploy that half-succeeds leaves neither column
-- holding the answer.
--
-- Rows with no seat get NULL rather than an empty list, which is what the
-- application writes for a flight nobody has typed a seat into.
UPDATE `flights`
SET `passengers` = json_array(json_object('name', '', 'seat', `seat`))
WHERE `seat` IS NOT NULL AND trim(`seat`) <> '' AND `passengers` IS NULL;
--> statement-breakpoint
ALTER TABLE `flights` DROP COLUMN `seat`;
