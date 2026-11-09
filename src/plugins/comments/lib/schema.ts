import { db } from "../../../lib/db";

// Comments plugin: the data lives only in this database (self-hosted), never in the repo or a third party.
// `key` is the public site key the embed sends; smtp_pass is encrypted (see integrations.ts). Times are ms.
db.exec(`CREATE TABLE IF NOT EXISTS comment_site (
  key TEXT PRIMARY KEY,
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  domain TEXT NOT NULL DEFAULT '',
  allowed_origins TEXT NOT NULL DEFAULT '[]',
  auto_approve INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'AUTO',
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  radius INTEGER NOT NULL DEFAULT 8,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  like_limit INTEGER NOT NULL DEFAULT 10,
  subject_prefix TEXT,
  logo_url TEXT,
  accent_color TEXT,
  footer_text TEXT,
  notify_email TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_from TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (owner, repo)
)`);
// The site's own Google / GitHub OAuth apps for commenter sign-in, encrypted JSON (added after the table shipped).
if (!(db.prepare("PRAGMA table_info(comment_site)").all() as { name: string }[]).some((c) => c.name === "oauth")) db.exec("ALTER TABLE comment_site ADD COLUMN oauth TEXT");
db.exec(`CREATE TABLE IF NOT EXISTS comment_page (
  id TEXT PRIMARY KEY,
  site_key TEXT NOT NULL,
  slug TEXT NOT NULL,
  url TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (site_key, slug)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS comment (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  parent_id TEXT,
  commenter_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  like_notified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  edited_at INTEGER
)`);
db.exec(`CREATE INDEX IF NOT EXISTS comment_page_status ON comment (page_id, status, created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS comment_parent ON comment (parent_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS comment_commenter ON comment (commenter_id)`);
db.exec(`CREATE TABLE IF NOT EXISTS comment_like (
  comment_id TEXT NOT NULL,
  commenter_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, commenter_id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS comment_moderation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL,
  action TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
db.exec(`CREATE INDEX IF NOT EXISTS comment_moderation_comment ON comment_moderation (comment_id)`);
db.exec(`CREATE TABLE IF NOT EXISTS comment_ban (
  site_key TEXT NOT NULL,
  commenter_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (site_key, commenter_id)
)`);
