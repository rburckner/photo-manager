import { Command } from 'commander';
import { rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';

/**
 * Bulk-stage redundant JPG files: atomic-rename each one into a staging
 * directory on the same NAS volume, and mark the DB row as trashed with
 * `trash_reason='jpg-redundant'` so the auto-purge cron will not delete it.
 *
 *   # Read paths from a file or stdin (one per line, file_path relative to mediaRoot)
 *   npx tsx src/cli/index.ts find-redundant-jpgs --paths-only | \
 *     npx tsx src/cli/index.ts move-redundant-jpgs
 *
 *   # Dry run — show what would happen, don't touch anything
 *   ... | npx tsx src/cli/index.ts move-redundant-jpgs --dry-run
 *
 * Skips silently for paths that:
 *   - Don't exist in the DB
 *   - Are already trashed
 *   - Are missing on disk (already moved manually, etc.)
 */
export function createMoveRedundantJpgsCommand(): Command {
  return new Command('move-redundant-jpgs')
    .description('Move JPGs (read from stdin) into .staged-jpgs/ and mark trashed in DB')
    .option('--dry-run', "Print what would happen without moving files or updating DB")
    .action(async (options: { dryRun?: boolean }) => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);
      const photoRepo = new PhotoRepository(db);

      const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
      const stagedDirRel = join('.staged-jpgs', ym);
      const stagedDirAbs = join(config.mediaRoot, stagedDirRel);

      if (!options.dryRun) {
        await mkdir(stagedDirAbs, { recursive: true });
      }

      const paths = await readLines(process.stdin);
      let moved = 0, skipped = 0, missing = 0, notInDb = 0;

      for (const relPath of paths) {
        const trimmed = relPath.trim();
        if (!trimmed) continue;

        // Look up DB row by the path that matches its current file_path.
        const photo = photoRepo.findByCurrentPath(trimmed);
        if (!photo) {
          process.stdout.write(`✗ unknown   ${trimmed}\n`);
          notInDb++;
          continue;
        }
        if (photo.deleted_at !== null) {
          process.stdout.write(`- skipped   ${trimmed}  (already trashed)\n`);
          skipped++;
          continue;
        }

        const srcAbs = join(config.mediaRoot, photo.file_path);
        if (!existsSync(srcAbs)) {
          process.stdout.write(`- missing   ${trimmed}  (file not on disk)\n`);
          missing++;
          continue;
        }

        // Preserve basename in staging dir; collisions handled by appending id.
        const baseName = basename(photo.file_path);
        let destRel = join(stagedDirRel, baseName);
        let destAbs = join(config.mediaRoot, destRel);
        if (existsSync(destAbs)) {
          // Disambiguate: prepend the photo id so a re-run with new pairs
          // doesn't clobber an earlier staging.
          destRel = join(stagedDirRel, `${photo.id}_${baseName}`);
          destAbs = join(config.mediaRoot, destRel);
        }

        if (options.dryRun) {
          process.stdout.write(`  would move ${trimmed}  →  ${destRel}\n`);
          moved++;
          continue;
        }

        try {
          await mkdir(dirname(destAbs), { recursive: true });
          await rename(srcAbs, destAbs);
          photoRepo.markTrashed(photo.id, destRel, 'jpg-redundant');
          process.stdout.write(`✓ moved     ${trimmed}  →  ${destRel}\n`);
          moved++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stdout.write(`✗ failed    ${trimmed}  (${msg})\n`);
          skipped++;
        }
      }

      const verb = options.dryRun ? 'would-move' : 'moved';
      process.stdout.write('\n');
      process.stdout.write(`${verb}: ${moved}, skipped: ${skipped}, missing-on-disk: ${missing}, not-in-db: ${notInDb}\n`);
      closeDb();
    });
}

/**
 * Read all newline-delimited entries from a stream into an array. Returns
 * empty array if the stream is empty (e.g. user forgot to pipe input).
 */
async function readLines(stream: NodeJS.ReadableStream): Promise<string[]> {
  const lines: string[] = [];
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    lines.push(line);
  }
  return lines;
}
