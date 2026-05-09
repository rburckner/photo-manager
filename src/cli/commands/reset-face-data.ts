import { Command } from 'commander';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';

/**
 * Wipe all face-detection state so a re-scan can start from a clean slate.
 *
 * Tables cleared (in this order, to respect FKs):
 *   - faces             (every detected face)
 *   - people            (every person card — named or not)
 *   - face_scan_status  (per-photo "we've scanned this" markers)
 *
 * Untouched:
 *   - photos / thumbnails / albums / tags / etc.
 *
 * Use case: after upgrading the face worker (e.g., switched to higher-
 * resolution input), an operator wants to re-detect every photo from
 * scratch with the new pipeline. Existing person assignments and names
 * will be lost — clustering will produce new person cards once the scan
 * completes, and they'll need to be renamed by hand.
 *
 *   npx tsx src/cli/index.ts reset-face-data --dry-run
 *   npx tsx src/cli/index.ts reset-face-data --yes
 */
export function createResetFaceDataCommand(): Command {
  return new Command('reset-face-data')
    .description('Wipe all faces, people, and face_scan_status rows for a clean re-scan')
    .option('--dry-run', 'Show counts that would be deleted, do nothing')
    .option('--yes', 'Skip the typed-confirmation prompt')
    .action(async (options: { dryRun?: boolean; yes?: boolean }) => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);

      const faceCount = (db.prepare('SELECT count(*) as c FROM faces').get() as { c: number }).c;
      const peopleCount = (db.prepare('SELECT count(*) as c FROM people').get() as { c: number }).c;
      const scanCount = (db.prepare('SELECT count(*) as c FROM face_scan_status').get() as { c: number }).c;
      const namedPeopleCount = (db.prepare("SELECT count(*) as c FROM people WHERE name IS NOT NULL AND name != ''").get() as { c: number }).c;

      process.stdout.write('Will delete:\n');
      process.stdout.write(`  ${faceCount.toLocaleString()} face rows\n`);
      process.stdout.write(`  ${peopleCount.toLocaleString()} people (${namedPeopleCount.toLocaleString()} named — names will be lost)\n`);
      process.stdout.write(`  ${scanCount.toLocaleString()} face_scan_status entries\n`);

      if (options.dryRun) {
        process.stdout.write('\n(dry-run — no changes made)\n');
        closeDb();
        return;
      }

      if (!options.yes) {
        process.stdout.write('\nRefusing without --yes (this is destructive). Re-run with --yes to proceed.\n');
        closeDb();
        return;
      }

      // Order matters: faces FK references people, but it's ON DELETE SET NULL
      // (per migration 003), so deleting people first would just NULL the
      // person_id on each face. Either order works in practice. We do faces
      // first so face_scan_status remains internally consistent during the
      // operation (a partial crash leaves a coherent state).
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM faces').run();
        db.prepare('DELETE FROM people').run();
        db.prepare('DELETE FROM face_scan_status').run();
      });
      tx();

      process.stdout.write('\nDone. Click "Scan for Faces" in Settings (or POST /api/faces/scan) to start the fresh sweep with the new worker pipeline.\n');
      closeDb();
    });
}
