-- Login throttling for staff access. Safe to reapply.
CREATE TABLE IF NOT EXISTS staff_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_login_attempts_ip_time
  ON staff_login_attempts(ip_hash, attempted_at);
