import Database from 'better-sqlite3';
import { runMigrations } from './db/migrate.js';
import { initLogger } from './shared/logger.js';
import type { PhotoInsert } from './shared/types.js';

let loggerInited = false;

/**
 * Create an in-memory SQLite database with all migrations applied.
 * Each call returns a fresh, isolated DB — no cross-test state leakage.
 */
export function makeTestDb(): Database.Database {
  if (!loggerInited) {
    initLogger({ logLevel: 'error' });
    loggerInited = true;
  }
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * Build a minimal valid PhotoInsert for tests.
 */
export function makePhotoInsert(overrides: Partial<PhotoInsert> = {}): PhotoInsert {
  return {
    file_path: 'test/photo.jpg',
    file_name: 'photo',
    file_hash: 'abc123',
    file_size: 1000,
    mime_type: 'image/jpeg',
    width: 100,
    height: 100,
    duration: null,
    date_taken: '2024-01-01T00:00:00.000Z',
    date_modified: '2024-01-01T00:00:00.000Z',
    camera_make: null,
    camera_model: null,
    lens: null,
    gps_lat: null,
    gps_lng: null,
    orientation: null,
    is_video: 0,
    is_favorite: 0,
    thumbnail_path: null,
    folder_path: 'test',
    perceptual_hash: null,
    ...overrides,
  };
}
