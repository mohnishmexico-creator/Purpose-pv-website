-- Purpose PV reservation system prototype
-- Apply only to a dedicated Cloudflare D1 test database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dining_tables (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 9),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 12),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  staff_notes TEXT
);

-- Owner-confirmed floor plan: 36 seats total.
INSERT OR IGNORE INTO dining_tables (id, capacity, is_active) VALUES
  (1, 8, 1), (2, 4, 1), (3, 4, 1),
  (4, 2, 1), (5, 4, 1), (6, 2, 1),
  (7, 4, 1), (8, 2, 1), (9, 6, 1);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  confirmation_code TEXT NOT NULL UNIQUE,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 8),
  reservation_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (90,120)),
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('requested','confirmed','seated','completed','cancelled','no_show')),
  source TEXT NOT NULL DEFAULT 'online'
    CHECK (source IN ('online','phone','walk_in','staff')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','es')),
  special_requests TEXT,
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservation_tables (
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL REFERENCES dining_tables(id),
  PRIMARY KEY (reservation_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(reservation_date, start_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservation_tables_table ON reservation_tables(table_id);
