import type Database from 'better-sqlite3';

export const name = '014_trash_reason';

/**
 * Add `trash_reason` to photos so the auto-purge cron can distinguish
 * user-initiated deletes (30-day retention) from system-staged
 * redundant-JPG candidates (no auto-purge — wait for manual FS rm).
 *
 * Values:
 *   NULL          legacy / pre-existing trashed rows (treated as 'user')
 *   'user'        user pressed delete in the UI (subject to retention)
 *   'jpg-redundant'  staged for deletion via `move-redundant-jpgs` CLI
 */
export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE photos ADD COLUMN trash_reason TEXT;
  `);
}
