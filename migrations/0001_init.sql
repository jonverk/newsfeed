CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'announcement',
  author TEXT NOT NULL DEFAULT 'Jon',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX posts_status_published ON posts(status, published_at DESC);

CREATE TABLE rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  effective_at TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX rules_status_category ON rules(status, category);

CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  saved_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX revisions_ref ON revisions(entity_type, entity_ref, saved_at DESC);

CREATE TABLE idempotency (
  key TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_index USING fts5(
  kind UNINDEXED, slug UNINDEXED, title, body
);
