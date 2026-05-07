import type Database from 'better-sqlite3';

export const name = '006_devices';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      api_key     TEXT    NOT NULL UNIQUE,
      is_active   INTEGER NOT NULL DEFAULT 1,
      paired_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      last_seen   TEXT
    );

    CREATE TABLE IF NOT EXISTS pairing_codes (
      code        TEXT    PRIMARY KEY,
      expires_at  TEXT    NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0
    );

    -- Activity log
    CREATE TABLE IF NOT EXISTS activity_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      action      TEXT    NOT NULL,
      details     TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

    -- Add auth_required setting (default false for backward compat)
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auth_required', 'false');
  `);
}
