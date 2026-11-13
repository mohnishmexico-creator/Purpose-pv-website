-- Add end-date support and database-level double-booking protection.
-- Run only on the dedicated TEST D1 database.
ALTER TABLE reservations ADD COLUMN end_date TEXT;

UPDATE reservations
SET end_date = date(reservation_date || 'T' || start_time, '+' || duration_minutes || ' minutes');

CREATE TRIGGER IF NOT EXISTS prevent_overlapping_table_assignment
BEFORE INSERT ON reservation_tables
WHEN EXISTS (
  SELECT 1
  FROM reservation_tables existing_assignment
  JOIN reservations existing_reservation
    ON existing_reservation.id = existing_assignment.reservation_id
  JOIN reservations new_reservation
    ON new_reservation.id = NEW.reservation_id
  WHERE existing_assignment.table_id = NEW.table_id
    AND existing_reservation.status IN ('requested','confirmed','seated')
    AND new_reservation.status IN ('requested','confirmed','seated')
    AND julianday(existing_reservation.reservation_date || 'T' || existing_reservation.start_time)
        < julianday(new_reservation.end_date || 'T' || new_reservation.end_time)
    AND julianday(new_reservation.reservation_date || 'T' || new_reservation.start_time)
        < julianday(existing_reservation.end_date || 'T' || existing_reservation.end_time)
)
BEGIN
  SELECT RAISE(ABORT, 'TABLE_TIME_CONFLICT');
END;

CREATE TRIGGER IF NOT EXISTS prevent_reactivating_conflicting_reservation
BEFORE UPDATE OF status ON reservations
WHEN NEW.status IN ('requested','confirmed','seated')
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM reservation_tables mine
    JOIN reservation_tables other_table
      ON other_table.table_id = mine.table_id
     AND other_table.reservation_id <> NEW.id
    JOIN reservations other_reservation
      ON other_reservation.id = other_table.reservation_id
    WHERE mine.reservation_id = NEW.id
      AND other_reservation.status IN ('requested','confirmed','seated')
      AND julianday(other_reservation.reservation_date || 'T' || other_reservation.start_time)
          < julianday(NEW.end_date || 'T' || NEW.end_time)
      AND julianday(NEW.reservation_date || 'T' || NEW.start_time)
          < julianday(other_reservation.end_date || 'T' || other_reservation.end_time)
  ) THEN RAISE(ABORT, 'TABLE_TIME_CONFLICT') END;
END;
