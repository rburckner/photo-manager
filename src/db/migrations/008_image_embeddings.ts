import type Database from 'better-sqlite3';

export const name = '008_image_embeddings';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_embeddings (
      photo_id    INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
      embedding   BLOB NOT NULL,
      model       TEXT NOT NULL DEFAULT 'mobilenet',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
