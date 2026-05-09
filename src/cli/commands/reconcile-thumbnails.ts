import { Command } from 'commander';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { reconcileThumbnails } from '../../scanner/reconcile-thumbnails.js';

/**
 * NULL the thumbnail_path of any photo whose thumbnail file is missing on
 * disk so the next thumbnail-generation pass picks them up.
 *
 *   npx tsx src/cli/index.ts reconcile-thumbnails --dry-run
 *   npx tsx src/cli/index.ts reconcile-thumbnails
 */
export function createReconcileThumbnailsCommand(): Command {
  return new Command('reconcile-thumbnails')
    .description('NULL thumbnail_path for photos whose thumb file is missing on disk')
    .option('--dry-run', 'Report counts without modifying the DB')
    .action((options: { dryRun?: boolean }) => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);
      const photoRepo = new PhotoRepository(db);

      const result = reconcileThumbnails(photoRepo, config.thumbnailDir, {
        dryRun: options.dryRun,
      });

      process.stdout.write(`Checked:        ${result.checked.toLocaleString()}\n`);
      process.stdout.write(`Missing files:  ${result.missing.toLocaleString()}\n`);
      if (options.dryRun) {
        process.stdout.write('\n(dry-run — no changes made)\n');
      } else {
        process.stdout.write(`Cleared paths:  ${result.cleared.toLocaleString()}\n`);
        if (result.cleared > 0) {
          process.stdout.write('\nRun "Generate thumbnails" in Settings (or wait for the daily cron) to regenerate.\n');
        }
      }
      closeDb();
    });
}
