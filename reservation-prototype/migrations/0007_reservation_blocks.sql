CREATE TABLE IF NOT EXISTS reservation_blocks (
 id TEXT PRIMARY KEY, reservation_date TEXT NOT NULL,
 start_time TEXT NOT NULL, end_time TEXT NOT NULL,
 CHECK(start_time < end_time)
);
CREATE INDEX IF NOT EXISTS reservation_blocks_date ON reservation_blocks(reservation_date);
CREATE TRIGGER IF NOT EXISTS reservation_block_insert BEFORE INSERT ON reservations
WHEN NEW.status IN ('requested','confirmed','seated') AND EXISTS (
 SELECT 1 FROM reservation_blocks b WHERE b.reservation_date=NEW.reservation_date AND b.start_time<NEW.end_time AND b.end_time>NEW.start_time
)
BEGIN SELECT RAISE(ABORT,'RESERVATION_BLOCKED'); END;
CREATE TRIGGER IF NOT EXISTS reservation_block_update BEFORE UPDATE OF reservation_date,start_time,end_time ON reservations
WHEN NEW.status IN ('requested','confirmed','seated') AND (NEW.reservation_date<>OLD.reservation_date OR NEW.start_time<>OLD.start_time OR NEW.end_time<>OLD.end_time) AND EXISTS (
 SELECT 1 FROM reservation_blocks b WHERE b.reservation_date=NEW.reservation_date AND b.start_time<NEW.end_time AND b.end_time>NEW.start_time
)
BEGIN SELECT RAISE(ABORT,'RESERVATION_BLOCKED'); END;
