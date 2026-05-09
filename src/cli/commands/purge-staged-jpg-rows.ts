import { Command } from 'commander';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';

/**
 * Drops every DB row marked `trash_reason='jpg-redundant'` and unlinks each
 * row's cached thumbnail. Does NOT touch the JPG files in .staged-jpgs/ —
 * those remain on the NAS as orphans, available for manual review or rm at
 * the user's pace.
 *
 *   npx tsx src/cli/index.ts purge-staged-jpg-rows --dry-run
 *   npx tsx src/cli/index.ts purge-staged-jpg-rows
 *
 * Cascading deletes handle: faces, image_embeddings, face_scan_status,
 * shares, album_photos, photo_tags (some via FK CASCADE, some via
 * purgeRow's explicit DELETEs).
 */
export function createPurgeStagedJpgRowsCommand(): Command {
  return new Command('purge-staged-jpg-rows')
    .description('Drop DB rows for staged-redundant JPGs (leaves the JPG files on disk)')
    .option('--dry-run', 'Show what would happen without modifying the DB or thumbnail cache')
    .action(async (options: { dryRun?: boolean }) => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);
      const photoRepo = new PhotoRepository(db);

      const rows = db.prepare(
        "SELECT id, file_path, file_hash, thumbnail_path FROM photos WHERE trash_reason = 'jpg-redundant'",
      ).all() as Array<{ id: number; file_path: string; file_hash: string; thumbnail_path: string | null }>;

      if (rows.length === 0) {
        process.stdout.write('No jpg-redundant rows to purge.\n');
        closeDb();
        return;
      }

      process.stdout.write(`${rows.length.toLocaleString()} rows queued for DB removal.\n`);
      if (options.dryRun) {
        process.stdout.write(`(dry-run — no changes made)\n`);
        closeDb();
        return;
      }

      let purged = 0, thumbsRemoved = 0, thumbErrors = 0;
      const tx = db.transaction((id: number) => { photoRepo.purgeRow(id); });

      for (const row of rows) {
        try {
          tx(row.id);
          purged++;
        } catch (err) {
          process.stdout.write(`✗ row ${row.id} (${row.file_path}): ${err instanceof Error ? err.message : String(err)}\n`);
          continue;
        }

        if (row.thumbnail_path) {
          const thumbAbs = join(config.thumbnailDir, row.thumbnail_path);
          try {
            await unlink(thumbAbs);
            thumbsRemoved++;
          } catch {
            // Thumb may be already gone (e.g., from a partial earlier run) — non-fatal.
            thumbErrors++;
          }
        }

        if (purged % 1000 === 0) {
          process.stdout.write(`  ${purged.toLocaleString()} / ${rows.length.toLocaleString()} purged...\n`);
        }
      }

      process.stdout.write('\n');
      process.stdout.write(`Done. Purged ${purged.toLocaleString()} rows; removed ${thumbsRemoved.toLocaleString()} thumbnails (${thumbErrors.toLocaleString()} already missing).\n`);
      process.stdout.write('Staged JPG files on the NAS were not touched — rm them at your leisure.\n');
      closeDb();
    });
}
