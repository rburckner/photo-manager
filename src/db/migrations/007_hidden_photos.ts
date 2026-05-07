import type Database from 'better-sqlite3';

export const name = '007_hidden_photos';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE photos ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_photos_is_hidden ON photos(is_hidden);
  `);
}
