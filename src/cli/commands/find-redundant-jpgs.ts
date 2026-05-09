import { Command } from 'commander';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';

/**
 * Read-only report of JPG files that have a HEIC/HEIF sibling in the same
 * directory (same basename). The output is intended to be saved, reviewed,
 * and then piped into `move-redundant-jpgs` for bulk staging.
 *
 *   npx tsx src/cli/index.ts find-redundant-jpgs > redundant.tsv
 *   npx tsx src/cli/index.ts find-redundant-jpgs --csv > redundant.csv
 *   npx tsx src/cli/index.ts find-redundant-jpgs --paths-only  # just JPG paths
 *
 * No filesystem touches; pure DB self-join.
 */
export function createFindRedundantJpgsCommand(): Command {
  return new Command('find-redundant-jpgs')
    .description('List JPG files that have a HEIC sibling in the same folder')
    .option('--csv', 'Output as CSV instead of TSV')
    .option('--paths-only', 'Output only the JPG paths (one per line) — pipe-friendly for move-redundant-jpgs')
    .action((options: { csv?: boolean; pathsOnly?: boolean }) => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);

      const photoRepo = new PhotoRepository(db);
      const pairs = photoRepo.findRedundantJpgs();

      if (options.pathsOnly) {
        for (const p of pairs) console.log(p.jpg_path);
        process.stderr.write(`\n${pairs.length.toLocaleString()} pairs found\n`);
        closeDb();
        return;
      }

      const sep = options.csv ? ',' : '\t';
      const header = ['jpg_path', 'jpg_size', 'heic_path', 'heic_size', 'mtime_match'].join(sep);
      console.log(header);

      let totalJpgBytes = 0;
      for (const p of pairs) {
        // Flag rows where JPG mtime is later than HEIC mtime — likely an
        // edited JPG that doesn't perfectly twin the HEIC. The user can
        // skip those rows during review.
        const mtimeMatch = p.jpg_mtime <= p.heic_mtime ? 'yes' : 'no';
        const fields = [p.jpg_path, p.jpg_size, p.heic_path, p.heic_size, mtimeMatch];
        console.log(fields.map((f) => csvEscape(String(f), sep)).join(sep));
        totalJpgBytes += p.jpg_size;
      }

      process.stderr.write(`\n${pairs.length.toLocaleString()} pairs — ${formatBytes(totalJpgBytes)} of redundant JPG storage\n`);
      closeDb();
    });
}

function csvEscape(value: string, sep: string): string {
  if (sep === ',' && /[,"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
