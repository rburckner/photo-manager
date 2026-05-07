import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { ScanProgressRepository } from '../db/repositories/scan-progress.repository.js';
import { runScan } from '../scanner/index.js';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

const DEFAULT_CRON_HOUR = 2; // 2 AM

/**
 * Starts a daily re-index timer. Runs an incremental scan
 * at the configured hour (default 2 AM).
 */
export function startCronReindex(
  config: AppConfig,
  photoRepo: PhotoRepository,
  scanProgressRepo: ScanProgressRepository,
): void {
  const log = getLogger();
  const cronHour = parseInt(process.env['PM_CRON_HOUR'] ?? String(DEFAULT_CRON_HOUR), 10);

  function msUntilNextRun(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(cronHour, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  function scheduleNext(): void {
    const delay = msUntilNextRun();
    const nextRun = new Date(Date.now() + delay);
    log.info({ nextRun: nextRun.toISOString(), cronHour }, 'Next re-index scheduled');

    setTimeout(() => {
      void runReindex();
      scheduleNext();
    }, delay);
  }

  async function runReindex(): Promise<void> {
    log.info('Starting daily re-index');

    try {
      const result = await runScan(
        {
          rootPath: config.mediaRoot,
          mediaRoot: config.mediaRoot,
          thumbnailDir: config.thumbnailDir,
          generateThumbnails: true,
          concurrency: config.scanConcurrency,
          batchSize: config.scanBatchSize,
          force: false,
          dryRun: false,
        },
        photoRepo,
        scanProgressRepo,
        {
          onProgress(_current, _total, _file) { /* silent */ },
          onError(file, err) { log.warn({ file, error: err.message }, 'Re-index file error'); },
          onComplete(r) {
            log.info({
              total: r.totalFiles,
              processed: r.processedFiles,
              skipped: r.skippedFiles,
              errors: r.errorCount,
              durationSec: Math.round(r.durationMs / 1000),
            }, 'Daily re-index complete');
          },
        },
      );

      if (result.processedFiles > 0) {
        log.info({ newFiles: result.processedFiles }, 'New files indexed');
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ error }, 'Daily re-index failed');
    }
  }

  scheduleNext();
}
