import type Database from 'better-sqlite3';

export const name = '010_trash';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE photos ADD COLUMN deleted_at TEXT;
    ALTER TABLE photos ADD COLUMN trash_path TEXT;
    ALTER TABLE photos ADD COLUMN original_path TEXT;
    CREATE INDEX IF NOT EXISTS idx_photos_deleted_at ON photos(deleted_at);
  `);
}
