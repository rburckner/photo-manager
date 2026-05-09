import type Database from 'better-sqlite3';

export const name = '013_tv_date_range';

/**
 * Seed TV slideshow / DLNA date-range settings.
 *
 * Both keys hold ISO date strings (e.g. '2020-01-01') or empty string for
 * "no bound". The slideshow query filters `date_taken` (with `date_modified`
 * fallback) inside this window.
 *
 * Replaces the deprecated "TV Slideshow" auto-album that previously gated
 * the DLNA / slideshow content. Now they both serve all non-hidden photos
 * within the configured window.
 */
export function up(db: Database.Database): void {
  db.exec(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('tv_from_date', '');
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('tv_to_date', '');
  `);
}
