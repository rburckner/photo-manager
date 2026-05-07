import type Database from 'better-sqlite3';

export const name = '011_perceptual_hash';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE photos ADD COLUMN perceptual_hash TEXT;
    CREATE INDEX IF NOT EXISTS idx_photos_perceptual_hash ON photos(perceptual_hash) WHERE perceptual_hash IS NOT NULL;
  `);
}
