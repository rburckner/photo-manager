import type Database from 'better-sqlite3';

export const name = '012_show_hidden_setting';

/**
 * Seed the `show_hidden` app setting (default '0').
 *
 * When '1', the photo repository's user-facing browsing queries (timeline,
 * folder, search, favorites, similar, map, slideshow, stats) skip BOTH:
 *   - the per-photo `is_hidden = 1` filter
 *   - the per-person `people.status = 'hidden'` filter
 *
 * Used by the Settings "Show hidden content" override toggle so users can
 * temporarily see photos they've intentionally hidden, without un-hiding them.
 */
export function up(db: Database.Database): void {
  db.exec(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('show_hidden', 'false');
  `);
}
