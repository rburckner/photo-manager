import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLogger } from '../shared/logger.js';

let db: Database.Database | undefined;

export function getDb(dbPath: string): Database.Database {
  if (db) {
    return db;
  }

  const log = getLogger();

  // Ensure the directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  log.debug({ dbPath }, 'Opening SQLite database');

  db = new Database(dbPath);

  // Performance and safety pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}
