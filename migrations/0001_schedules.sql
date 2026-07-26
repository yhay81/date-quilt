PRAGMA foreign_keys = ON;

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  owner_token_hash TEXT NOT NULL,
  creator_session_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'finalized')),
  finalized_candidate_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

CREATE TABLE candidate_slots (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL
    CHECK (duration_minutes BETWEEN 30 AND 720),
  position INTEGER NOT NULL,
  UNIQUE (schedule_id, starts_at)
);

CREATE INDEX candidate_slots_schedule_idx
  ON candidate_slots (schedule_id, position);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  edit_token_hash TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 120),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX participants_schedule_idx
  ON participants (schedule_id, created_at);

CREATE TABLE availability (
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidate_slots(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
  PRIMARY KEY (participant_id, candidate_id)
);

CREATE INDEX availability_candidate_idx
  ON availability (candidate_id, status);

CREATE TABLE product_events (
  session_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (
    name IN ('visited', 'share_copied', 'calendar_added', 'returned')
  ),
  context TEXT NOT NULL DEFAULT '',
  occurred_on TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (session_id, name, context, occurred_on)
);

CREATE INDEX product_events_date_idx
  ON product_events (occurred_on, name);
