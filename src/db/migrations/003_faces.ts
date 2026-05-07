import type Database from 'better-sqlite3';

export const name = '003_faces';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT,
      status      TEXT NOT NULL DEFAULT 'unreviewed'
                  CHECK (status IN ('named', 'hidden', 'ignored', 'unreviewed')),
      photo_count INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS faces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      person_id   INTEGER REFERENCES people(id) ON DELETE SET NULL,
      embedding   BLOB NOT NULL,
      x           REAL NOT NULL,
      y           REAL NOT NULL,
      width       REAL NOT NULL,
      height      REAL NOT NULL,
      confidence  REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_faces_photo_id ON faces(photo_id);
    CREATE INDEX IF NOT EXISTS idx_faces_person_id ON faces(person_id);

    -- Track which photos have been scanned for faces
    CREATE TABLE IF NOT EXISTS face_scan_status (
      photo_id    INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
      scanned_at  TEXT NOT NULL DEFAULT (datetime('now')),
      face_count  INTEGER NOT NULL DEFAULT 0
    );
  `);
}
