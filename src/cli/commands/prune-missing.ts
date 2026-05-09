import { Command } from 'commander';
import { unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';

/**
 * Reconcile the DB after manual filesystem deletion of trashed files.
 *
 *   # After `rm -rf /photos/.staged-jpgs/...`:
 *   npx tsx src/cli/index.ts prune-missing
 *
 *   # Or operate on a specific list of paths:
 *   cat redundant.tsv | tail -n +2 | cut -f1 | \
 *     npx tsx src/cli/index.ts prune-missing
 *
 * Behavior:
 *   - With no stdin input: scans every trashed row in the DB; prunes those
 *     whose trash_path file is missing on disk. (`trash_reason='user'` rows
 *     are scanned too — handy for cleaning up after a manual NAS purge.)
 *   - With stdin input: only inspects the supplied paths. If a path's file
 *     is missing AND the row is in the DB, drops it. Files that still exist
 *     are skipped (safety guard against typos in the input list).
 *
 * Per-row work in a transaction:
 *   - DELETE FROM photos (cascades to faces, embeddings, scan_status, joins)
 *   - unlink the cached thumbnail at {thumbnailDir}/{hash[:2]}/{hash}.jpg
 */
export function createPruneMissingCommand(): Command {
  return new Command('prune-missing')
    .description('Drop DB rows whose backing file is missing on disk')
    .option('--dry-run', "Show what would be pruned without modifying anything")
    .action(async (options: { dryRun?: boolean }) => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);
      const photoRepo = new PhotoRepository(db);

      // If stdin is a TTY there's no piped input — scan all trashed rows.
      const hasStdinInput = !process.stdin.isTTY;
      const inputPaths = hasStdinInput ? await readLines(process.stdin) : null;

      let pruned = 0, skippedExists = 0, notInDb = 0, thumbsRemoved = 0;

      const tx = db.transaction((photoId: number, thumbnailPath: string | null) => {
        photoRepo.purgeRow(photoId);
        return thumbnailPath;
      });

      const targetRows: Array<{ id: number; relPath: string; thumbnail_path: string | null }> = [];
      if (inputPaths) {
        for (const line of inputPaths) {
          const path = line.trim();
          if (!path) continue;
          // Look up the row by its current file_path. Trashed rows have
          // file_path set to the trash_path (.staged-jpgs/... or .trash/...).
          const row = photoRepo.findByCurrentPath(path);
          if (!row) {
            process.stdout.write(`✗ unknown   ${path}  (not in DB)\n`);
            notInDb++;
            continue;
          }
          targetRows.push({ id: row.id, relPath: path, thumbnail_path: row.thumbnail_path });
        }
      } else {
        // Scan all trashed rows
        for (const row of photoRepo.getAllTrashed()) {
          targetRows.push({ id: row.id, relPath: row.file_path, thumbnail_path: row.thumbnail_path });
        }
        // Also include 'jpg-redundant' rows since getAllTrashed scopes to user-trash only
        const allStaged = db.prepare(
          "SELECT id, file_path, thumbnail_path FROM photos WHERE deleted_at IS NOT NULL AND trash_reason = 'jpg-redundant'",
        ).all() as Array<{ id: number; file_path: string; thumbnail_path: string | null }>;
        for (const row of allStaged) {
          targetRows.push({ id: row.id, relPath: row.file_path, thumbnail_path: row.thumbnail_path });
        }
      }

      for (const { id, relPath, thumbnail_path } of targetRows) {
        const fileAbs = join(config.mediaRoot, relPath);
        if (existsSync(fileAbs)) {
          process.stdout.write(`- skipped   ${relPath}  (file still exists on disk)\n`);
          skippedExists++;
          continue;
        }

        if (options.dryRun) {
          process.stdout.write(`  would prune ${relPath}\n`);
          pruned++;
          continue;
        }

        try {
          tx(id, thumbnail_path);
          if (thumbnail_path) {
            const thumbAbs = join(config.thumbnailDir, thumbnail_path);
            try {
              await unlink(thumbAbs);
              thumbsRemoved++;
            } catch {
              // Thumb may already be gone — non-fatal.
            }
          }
          process.stdout.write(`✓ pruned    ${relPath}\n`);
          pruned++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stdout.write(`✗ failed    ${relPath}  (${msg})\n`);
        }
      }

      const verb = options.dryRun ? 'would-prune' : 'pruned';
      process.stdout.write('\n');
      process.stdout.write(`${verb}: ${pruned}, file-still-exists: ${skippedExists}, not-in-db: ${notInDb}, thumbs-removed: ${thumbsRemoved}\n`);
      closeDb();
    });
}

async function readLines(stream: NodeJS.ReadableStream): Promise<string[]> {
  const lines: string[] = [];
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    lines.push(line);
  }
  return lines;
}
