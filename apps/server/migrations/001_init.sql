-- TasteQuest schema v1. Timestamps are ISO-8601 UTC strings; the UI converts to WIB.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('DEMO', 'LIVE')),
  firmware TEXT,
  rssi INTEGER,
  phase TEXT,
  uptime_ms INTEGER,
  free_heap INTEGER,
  queue_size INTEGER,
  sensors TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Every accepted device event; event_uid is the device-generated idempotency key.
CREATE TABLE device_events (
  id INTEGER PRIMARY KEY,
  event_uid TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('DEMO', 'LIVE')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX idx_events_source_time ON device_events (source, occurred_at);

-- Low-frequency historical samples only (live readings stay in memory).
CREATE TABLE telemetry (
  id INTEGER PRIMARY KEY,
  device_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('DEMO', 'LIVE')),
  temperature_c REAL,
  humidity_pct REAL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX idx_telemetry_device_time ON telemetry (device_id, recorded_at);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE game_sessions (
  id INTEGER PRIMARY KEY,
  session_uid TEXT NOT NULL UNIQUE,
  player_code TEXT NOT NULL UNIQUE,
  nickname TEXT,
  device_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('DEMO', 'LIVE')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'aborted')),
  total_score INTEGER,
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_sessions_board ON game_sessions (source, status, total_score DESC, duration_ms, completed_at);

CREATE TABLE game_rounds (
  session_id INTEGER NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 3),
  target_cm REAL NOT NULL,
  measured_cm REAL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  PRIMARY KEY (session_id, round)
);

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY,
  event_uid TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('DEMO', 'LIVE')),
  level INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
  product_id INTEGER REFERENCES products (id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_source_time ON feedback (source, created_at);

CREATE TABLE operator_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
