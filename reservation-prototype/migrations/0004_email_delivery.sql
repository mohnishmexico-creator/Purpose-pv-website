-- Email delivery tracking for reservation confirmations.
-- Apply only to the isolated TEST D1 database.
ALTER TABLE reservations ADD COLUMN email_status TEXT NOT NULL DEFAULT 'not_requested'
  CHECK (email_status IN ('not_requested','pending','sent','failed'));
ALTER TABLE reservations ADD COLUMN email_sent_at TEXT;
ALTER TABLE reservations ADD COLUMN email_error TEXT;
