-- Enforce the Thursday Thali allocation at database level.
-- Thali allocation is 12 guests per clock hour (5–6, 6–7, 7–8, 8–9, 9–10 pm).
-- À la carte guests do not consume this allocation.
CREATE TRIGGER IF NOT EXISTS enforce_thursday_thali_hourly_limit
BEFORE INSERT ON reservations
WHEN CAST(strftime('%w', NEW.reservation_date) AS INTEGER) = 4
 AND NEW.status IN ('requested','confirmed','seated')
 AND NEW.thali_count > 0
BEGIN
  SELECT CASE WHEN
    COALESCE((
      SELECT SUM(thali_count) FROM reservations
      WHERE reservation_date = NEW.reservation_date
        AND substr(start_time,1,2) = substr(NEW.start_time,1,2)
        AND status IN ('requested','confirmed','seated')
    ),0) + NEW.thali_count > 12
  THEN RAISE(ABORT, 'THALI_HOURLY_LIMIT') END;
END;

CREATE TRIGGER IF NOT EXISTS enforce_thursday_thali_limit_on_update
BEFORE UPDATE OF status, thali_count, reservation_date, start_time ON reservations
WHEN CAST(strftime('%w', NEW.reservation_date) AS INTEGER) = 4
 AND NEW.status IN ('requested','confirmed','seated')
 AND NEW.thali_count > 0
BEGIN
  SELECT CASE WHEN
    COALESCE((
      SELECT SUM(thali_count) FROM reservations
      WHERE reservation_date = NEW.reservation_date
        AND substr(start_time,1,2) = substr(NEW.start_time,1,2)
        AND status IN ('requested','confirmed','seated')
        AND id <> NEW.id
    ),0) + NEW.thali_count > 12
  THEN RAISE(ABORT, 'THALI_HOURLY_LIMIT') END;
END;
