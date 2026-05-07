import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { ScanProgressRepository } from '../db/repositories/scan-progress.repository.js';
import { FaceRepository } from '../db/repositories/face.repository.js';
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
  faceRepo?: FaceRepository,
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

      // Generate missing thumbnails (videos + any failed images)
      try {
        const { generateThumbnail } = await import('../scanner/thumbnails.js');
        const { join } = await import('node:path');
        const missing = photoRepo.getPhotosWithoutThumbnails(200);
        let thumbsGenerated = 0;
        for (const photo of missing) {
          const filePath = join(config.mediaRoot, photo.file_path);
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

      // Run face detection on new photos (small batch to avoid CPU overload)
      if (faceRepo) {
        try {
          const { runFaceScan, clusterFaces } = await import('../scanner/faces.js');
          const faceResult = await runFaceScan(photoRepo, faceRepo, config, 50);
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
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error({ error }, 'Daily re-index failed');
    }
  }

  scheduleNext();
}
