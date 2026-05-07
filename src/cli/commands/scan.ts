import { Command } from 'commander';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { ScanProgressRepository } from '../../db/repositories/scan-progress.repository.js';
import { runScan } from '../../scanner/index.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';
import type { ScanConfig } from '../../shared/types.js';

export function createScanCommand(): Command {
  return new Command('scan')
    .description('Scan a directory for photos and videos')
    .argument('[path]', 'Directory to scan (default: PM_MEDIA_ROOT)')
    .option('--thumbnail-dir <dir>', 'Thumbnail output directory')
    .option('--no-thumbnails', 'Skip thumbnail generation')
    .option('--dry-run', 'Count files without writing to DB')
    .option('--concurrency <n>', 'Parallel file operations', '4')
    .option('--force', 'Re-scan all files, ignore incremental cache')
    .option('-v, --verbose', 'Verbose logging')
    .action(async (path: string | undefined, options: {
      thumbnailDir?: string;
      thumbnails: boolean;
      dryRun?: boolean;
      concurrency: string;
      force?: boolean;
      verbose?: boolean;
    }) => {
      const config = loadConfig();
      const log = initLogger({ logLevel: options.verbose ? 'debug' : config.logLevel });

      const rootPath = path ?? config.mediaRoot;
      const thumbnailDir = options.thumbnailDir ?? config.thumbnailDir;

      log.info({ rootPath, thumbnailDir }, 'Scan configuration');

      const db = getDb(config.dbPath);
      runMigrations(db);

      const photoRepo = new PhotoRepository(db);
      const scanProgressRepo = new ScanProgressRepository(db);

      const scanConfig: ScanConfig = {
        rootPath,
        mediaRoot: config.mediaRoot,
        thumbnailDir,
        generateThumbnails: options.thumbnails,
        concurrency: parseInt(options.concurrency, 10),
        batchSize: config.scanBatchSize,
        force: options.force ?? false,
        dryRun: options.dryRun ?? false,
      };

      let lastProgressLine = '';

      try {
        const result = await runScan(scanConfig, photoRepo, scanProgressRepo, {
          onProgress(current, total, filePath) {
            const pct = Math.round((current / total) * 100);
            const line = `\r[${pct}%] ${current}/${total} - ${truncatePath(filePath, 60)}`;
            // Pad to overwrite previous line
            process.stdout.write(line.padEnd(lastProgressLine.length) );
            lastProgressLine = line;
          },
          onError(filePath, error) {
            // Clear progress line, print error, then resume
            process.stdout.write('\r' + ' '.repeat(lastProgressLine.length) + '\r');
            log.warn({ filePath, error: error.message }, 'File error');
          },
          onComplete(result) {
            // Clear progress line
            process.stdout.write('\r' + ' '.repeat(lastProgressLine.length) + '\r');

            const durationSec = Math.round(result.durationMs / 1000);
            const minutes = Math.floor(durationSec / 60);
            const seconds = durationSec % 60;

            console.log('\nScan complete:');
            console.log(`  Total files:     ${result.totalFiles}`);
            console.log(`  Processed:       ${result.processedFiles}`);
            console.log(`  Skipped:         ${result.skippedFiles}`);
            console.log(`  Errors:          ${result.errorCount}`);
            console.log(`  Duration:        ${minutes}m ${seconds}s`);
          },
        });

        if (result.errorCount > 0) {
          process.exitCode = 1;
        }
      } finally {
        closeDb();
      }
    });
}

function truncatePath(filePath: string, maxLen: number): string {
  if (filePath.length <= maxLen) {
    return filePath;
  }
  return '...' + filePath.slice(filePath.length - maxLen + 3);
}
