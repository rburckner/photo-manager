import type Database from 'better-sqlite3';

export const name = '002_cleanup_log';

export function up(db: Database.Database): void {
  db.exec(`
    -- Track files removed from the index that still exist on the NAS
    -- These need manual deletion by the user
    CREATE TABLE IF NOT EXISTS cleanup_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path   TEXT    NOT NULL,
      file_hash   TEXT    NOT NULL,
      reason      TEXT    NOT NULL DEFAULT 'duplicate',
      removed_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cleanup_log_removed_at ON cleanup_log(removed_at);
  `);
}
