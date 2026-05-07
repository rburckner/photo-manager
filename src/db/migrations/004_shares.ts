import type Database from 'better-sqlite3';

export const name = '004_shares';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token       TEXT    NOT NULL UNIQUE,
      photo_id    INTEGER REFERENCES photos(id) ON DELETE CASCADE,
      album_id    INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      expires_at  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
  `);
}
