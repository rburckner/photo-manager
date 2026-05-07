import type Database from 'better-sqlite3';

export const name = '005_settings';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Default settings
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('show_folders_nav', 'true');
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('show_duplicates_nav', 'true');
    INSERT OR IGNORE INTO app_settings (key, value) VALUES ('import_folder', 'imported');
  `);
}
