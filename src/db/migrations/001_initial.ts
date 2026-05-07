import type Database from 'better-sqlite3';

export const name = '001_initial';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path       TEXT    NOT NULL UNIQUE,
      file_name       TEXT    NOT NULL,
      file_hash       TEXT    NOT NULL,
      file_size       INTEGER NOT NULL,
      mime_type       TEXT    NOT NULL,
      width           INTEGER,
      height          INTEGER,
      duration        REAL,
      date_taken      TEXT,
      date_modified   TEXT    NOT NULL,
      camera_make     TEXT,
      camera_model    TEXT,
      lens            TEXT,
      gps_lat         REAL,
      gps_lng         REAL,
      orientation     INTEGER,
      is_video        INTEGER NOT NULL DEFAULT 0,
      is_favorite     INTEGER NOT NULL DEFAULT 0,
      thumbnail_path  TEXT,
      folder_path     TEXT    NOT NULL,
      scanned_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_photos_folder_path  ON photos(folder_path);
    CREATE INDEX IF NOT EXISTS idx_photos_date_taken   ON photos(date_taken);
    CREATE INDEX IF NOT EXISTS idx_photos_file_hash    ON photos(file_hash);
    CREATE INDEX IF NOT EXISTS idx_photos_mime_type    ON photos(mime_type);
    CREATE INDEX IF NOT EXISTS idx_photos_is_video     ON photos(is_video);
    CREATE INDEX IF NOT EXISTS idx_photos_gps          ON photos(gps_lat, gps_lng)
      WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL;

    CREATE TABLE IF NOT EXISTS albums (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      description     TEXT,
      cover_photo_id  INTEGER REFERENCES photos(id) ON DELETE SET NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS album_photos (
      album_id    INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      photo_id    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (album_id, photo_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL UNIQUE,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (photo_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS scan_progress (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      root_path       TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
      total_files     INTEGER NOT NULL DEFAULT 0,
      processed_files INTEGER NOT NULL DEFAULT 0,
      skipped_files   INTEGER NOT NULL DEFAULT 0,
      error_count     INTEGER NOT NULL DEFAULT 0,
      last_file_path  TEXT,
      started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT,
      error_log       TEXT
    );

    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
