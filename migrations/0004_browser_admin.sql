ALTER TABLE posts ADD COLUMN deleted_at TEXT;
ALTER TABLE rules ADD COLUMN deleted_at TEXT;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);

-- Include deletions when determining the last public change.
CREATE TABLE content_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  changed_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO content_state (id, changed_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
