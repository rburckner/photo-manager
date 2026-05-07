import type Database from 'better-sqlite3';
import { getLogger } from '../shared/logger.js';
import * as m001 from './migrations/001_initial.js';
import * as m002 from './migrations/002_cleanup_log.js';
import * as m003 from './migrations/003_faces.js';
import * as m004 from './migrations/004_shares.js';
import * as m005 from './migrations/005_settings.js';
import * as m006 from './migrations/006_devices.js';
import * as m007 from './migrations/007_hidden_photos.js';

interface Migration {
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
];

export function runMigrations(db: Database.Database): void {
  const log = getLogger();

  // Ensure _migrations table exists (bootstrap)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>)
      .map((row) => row.name),
  );

  const pending = migrations.filter((m) => !applied.has(m.name));

  if (pending.length === 0) {
    log.debug('All migrations are up to date');
    return;
  }

  log.info({ count: pending.length }, 'Running pending migrations');

  for (const migration of pending) {
    log.info({ migration: migration.name }, 'Applying migration');

    const applyMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
    });

    applyMigration();
    log.info({ migration: migration.name }, 'Migration applied');
  }
}
