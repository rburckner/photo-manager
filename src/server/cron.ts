import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { ScanProgressRepository } from '../db/repositories/scan-progress.repository.js';
import { FaceRepository } from '../db/repositories/face.repository.js';
import { runScan } from '../scanner/index.js';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import { getDb } from '../db/connection.js';

const DEFAULT_CRON_HOUR = 2; // 2 AM
const DEFAULT_TRASH_RETENTION_DAYS = 30;

/**
 * Resolve trash retention precedence: app_settings DB row > env var > default.
 * Read at each cron run so changes via the Settings UI take effect without a restart.
 */
function getTrashRetentionDays(config: AppConfig): number {
  try {
    const db = getDb(config.dbPath);
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'trash_retention_days'")
      .get() as { value: string } | undefined;
    if (row?.value) {
      const parsed = parseInt(row.value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Fall through to env / default
  }
  const envParsed = parseInt(process.env['PM_TRASH_RETENTION_DAYS'] ?? '', 10);
  if (!isNaN(envParsed) && envParsed > 0) return envParsed;
  return DEFAULT_TRASH_RETENTION_DAYS;
}

/**
 * Permanently delete photos that have been in trash longer than the retention window.
 * Called at the start of each daily cron run.
 */
export async function runAutoPurge(
  config: AppConfig,
  photoRepo: PhotoRepository,
): Promise<{ purged: number; errors: number }> {
  const log = getLogger();
  const retentionDays = getTrashRetentionDays(config);
  const expired = photoRepo.getExpiredTrash(retentionDays);
  if (expired.length === 0) {
    return { purged: 0, errors: 0 };
  }

  log.info({ count: expired.length, retentionDays }, 'Auto-purging expired trash');

  let purged = 0;
  let errors = 0;
  for (const photo of expired) {
    if (!photo.trash_path) continue;
    const fileAbs = join(config.mediaRoot, photo.trash_path);
    try {
      await unlink(fileAbs);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (!error.includes('ENOENT')) {
        log.warn({ photoId: photo.id, fileAbs, error }, 'Auto-purge file unlink failed');
        errors++;
      }
    }
    if (photo.thumbnail_path) {
      const thumbAbs = join(config.thumbnailDir, photo.thumbnail_path);
      try {
        await unlink(thumbAbs);
      } catch {
        // Thumbnails are regenerable, ignore failures.
      }
    }
    photoRepo.purgeRow(photo.id);
    purged++;
  }

  log.info({ purged, errors }, 'Auto-purge complete');
  return { purged, errors };
}

// ── Cron state (module-level for API access) ──
let cronEnabled = true;
let cronRunning = false;
let cronNextRun: string | null = null;
let cronLastRun: string | null = null;
let cronLastResult: string | null = null;
let cronHourSetting = DEFAULT_CRON_HOUR;
let cronTimer: ReturnType<typeof setTimeout> | null = null;
let cronRunReindex: (() => Promise<void>) | null = null;

export function getCronStatus(): {
  enabled: boolean;
  running: boolean;
  cronHour: number;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
} {
  return { enabled: cronEnabled, running: cronRunning, cronHour: cronHourSetting, nextRun: cronNextRun, lastRun: cronLastRun, lastResult: cronLastResult };
}

export function setCronEnabled(enabled: boolean): void {
  cronEnabled = enabled;
  const log = getLogger();
  if (!enabled && cronTimer) {
    clearTimeout(cronTimer);
    cronTimer = null;
    cronNextRun = null;
    log.info('Cron disabled');
  } else if (enabled) {
    scheduleNextCron();
    log.info('Cron enabled');
  }
}

export function setCronHour(hour: number): void {
  cronHourSetting = Math.max(0, Math.min(23, hour));
  if (cronEnabled) {
    if (cronTimer) clearTimeout(cronTimer);
    scheduleNextCron();
  }
}

export function triggerCronNow(): void {
  if (cronRunning) return;
  if (cronRunReindex) void cronRunReindex();
}

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(cronHourSetting, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function scheduleNextCron(): void {
  const delay = msUntilNextRun();
  const nextRun = new Date(Date.now() + delay);
  cronNextRun = nextRun.toISOString();
  const log = getLogger();
  log.info({ nextRun: cronNextRun, cronHour: cronHourSetting }, 'Next re-index scheduled');

  cronTimer = setTimeout(() => {
    if (cronRunReindex) void cronRunReindex();
    if (cronEnabled) scheduleNextCron();
  }, delay);
}

/**
 * Starts a daily re-index timer. Runs an incremental scan
 * at the configured hour (default 2 AM).
 */
export function startCronReindex(
  config: AppConfig,
  photoRepo: PhotoRepository,
  scanProgressRepo: ScanProgressRepository,
  faceRepo?: FaceRepository,
): void {
  const log = getLogger();
  cronHourSetting = parseInt(process.env['PM_CRON_HOUR'] ?? String(DEFAULT_CRON_HOUR), 10);

  async function runReindex(): Promise<void> {
    cronRunning = true;
    cronLastRun = new Date().toISOString();
    cronLastResult = null;
    log.info('Starting daily re-index');

    try {
      // Auto-purge expired trash before re-indexing.
      try {
        await runAutoPurge(config, photoRepo);
      } catch (purgeErr) {
        log.warn({ error: purgeErr instanceof Error ? purgeErr.message : String(purgeErr) }, 'Auto-purge failed');
      }

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

      // Generate missing thumbnails (videos + any failed images)
      try {
        const { generateThumbnail } = await import('../scanner/thumbnails.js');
        const path = await import('node:path');
        const missing = photoRepo.getPhotosWithoutThumbnails(200);
        let thumbsGenerated = 0;
        for (const photo of missing) {
          const filePath = path.join(config.mediaRoot, photo.file_path);
          const thumbPath = await generateThumbnail(filePath, photo.file_name, photo.is_video === 1, {
            size: config.thumbnailSize,
            quality: config.thumbnailQuality,
            outputDir: config.thumbnailDir,
          });
          if (thumbPath) {
            photoRepo.setThumbnailPath(photo.id, thumbPath);
            thumbsGenerated++;
          }
        }
        if (thumbsGenerated > 0) {
          log.info({ thumbsGenerated, checked: missing.length }, 'Missing thumbnails generated');
        }
      } catch (thumbErr) {
        log.warn({ error: thumbErr instanceof Error ? thumbErr.message : String(thumbErr) }, 'Thumbnail backfill failed');
      }

      // Backfill perceptual hashes for any photos missing them.
      try {
        const { computeDHash } = await import('../scanner/perceptual-hash.js');
        const missingHashes = photoRepo.getPhotosWithoutPerceptualHash(500);
        let hashed = 0;
        for (const photo of missingHashes) {
          const filePath = join(config.mediaRoot, photo.file_path);
          const hash = await computeDHash(filePath);
          if (hash) {
            photoRepo.setPerceptualHash(photo.id, hash);
            hashed++;
          }
        }
        if (hashed > 0) {
          log.info({ hashed, checked: missingHashes.length }, 'Perceptual hashes backfilled');
        }
      } catch (phashErr) {
        log.warn({ error: phashErr instanceof Error ? phashErr.message : String(phashErr) }, 'Perceptual hash backfill failed');
      }

      // Run face detection on new photos (small batch to avoid CPU overload)
      if (faceRepo) {
        try {
          // Worker-thread version — keeps the main API thread responsive
          // through the cron's face-detection batch (~10-25s of CPU work).
          const { runFaceScanWorker, clusterFaces } = await import('../scanner/faces.js');
          const faceResult = await runFaceScanWorker(photoRepo, faceRepo, config, 50);
          if (faceResult.facesFound > 0) {
            clusterFaces(faceRepo);
            log.info({ scanned: faceResult.scanned, facesFound: faceResult.facesFound }, 'Post-index face scan complete');
          }
        } catch (faceErr) {
          log.warn({ error: faceErr instanceof Error ? faceErr.message : String(faceErr) }, 'Face scan after re-index failed');
        }
      }
      // Generate visual embeddings for new photos (batch of 100)
      try {
        const { runEmbeddingScan } = await import('../scanner/embeddings.js');
        const { getDb } = await import('../db/connection.js');
        const embDb = getDb(config.dbPath);
        const embResult = await runEmbeddingScan(embDb, config, 100);
        if (embResult.embedded > 0) {
          log.info({ scanned: embResult.scanned, embedded: embResult.embedded }, 'Post-index embedding scan complete');
        }
      } catch (embErr) {
        log.warn({ error: embErr instanceof Error ? embErr.message : String(embErr) }, 'Embedding scan after re-index failed');
      }
      cronLastResult = 'Completed successfully';

      // Send notification
      try {
        const { createNotification } = await import('./routes/notifications.js');
        const { getDb } = await import('../db/connection.js');
        const notifDb = getDb(config.dbPath);
        createNotification(notifDb, 'cron', 'Daily re-index complete',
          `Processed ${result.processedFiles} files, skipped ${result.skippedFiles}`);
      } catch { /* ignore */ }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ error }, 'Daily re-index failed');
      cronLastResult = `Failed: ${error}`;

      try {
        const { createNotification } = await import('./routes/notifications.js');
        const { getDb } = await import('../db/connection.js');
        const notifDb = getDb(config.dbPath);
        createNotification(notifDb, 'error', 'Daily re-index failed', error);
      } catch { /* ignore */ }
    }
    cronRunning = false;
  }

  cronRunReindex = runReindex;
  scheduleNextCron();
}
