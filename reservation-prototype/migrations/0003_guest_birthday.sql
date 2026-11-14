-- Store only month and day for optional birthday recognition; do not collect birth year.
-- Apply only to the isolated TEST D1 database.
ALTER TABLE reservations ADD COLUMN birthday TEXT;
CREATE INDEX IF NOT EXISTS idx_reservations_birthday ON reservations(birthday);
