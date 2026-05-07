import { walkDirectory, countFiles } from './walker.js';
import { extractExif } from './exif.js';
import { getMediaInfo } from './media-info.js';
import { generateThumbnail } from './thumbnails.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { ScanProgressRepository } from '../db/repositories/scan-progress.repository.js';
import type { FileEntry, PhotoInsert, ScanCallbacks, ScanConfig, ScanResult } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

/**
 * Runs a full or incremental scan of the media directory.
 *
 * Algorithm:
 * 1. Count total files (for progress reporting)
 * 2. Walk the directory tree
 * 3. For each file, check if already indexed with matching mtime (skip if so)
 * 4. Process in batches: extract EXIF, detect media info, generate thumbnail
 * 5. Persist batch to SQLite in a single transaction
 * 6. Track progress for resumability
 */
export async function runScan(
  config: ScanConfig,
  photoRepo: PhotoRepository,
  scanProgressRepo: ScanProgressRepository,
  callbacks?: Partial<ScanCallbacks>,
): Promise<ScanResult> {
  const log = getLogger();
  const startTime = Date.now();

  log.info({ rootPath: config.rootPath }, 'Starting scan');

  // Phase 1: count total files
  log.info('Counting files...');
  const totalFiles = await countFiles({ rootPath: config.rootPath, mediaRoot: config.mediaRoot });
  log.info({ totalFiles }, 'File count complete');

  if (totalFiles === 0) {
    log.warn('No supported media files found');
    return { totalFiles: 0, processedFiles: 0, skippedFiles: 0, errorCount: 0, durationMs: 0 };
  }

  // Create scan progress record
  const scanId = scanProgressRepo.create(config.rootPath, totalFiles);

  let processedFiles = 0;
  let skippedFiles = 0;
  let errorCount = 0;
  const batch: PhotoInsert[] = [];

  try {
    for await (const entry of walkDirectory({ rootPath: config.rootPath, mediaRoot: config.mediaRoot })) {
      // Incremental: skip files that haven't changed
      if (!config.force) {
        const existingMtime = photoRepo.getDateModified(entry.relativePath);
        if (existingMtime === entry.dateModified.toISOString()) {
          skippedFiles++;
          reportProgress(callbacks, processedFiles + skippedFiles, totalFiles, entry.relativePath);
          continue;
        }
      }

      if (config.dryRun) {
        processedFiles++;
        reportProgress(callbacks, processedFiles + skippedFiles, totalFiles, entry.relativePath);
        continue;
      }

      // Process the file
      try {
        const photoInsert = await processFile(entry, config);
        batch.push(photoInsert);
      } catch (err) {
        errorCount++;
        const error = err instanceof Error ? err : new Error(String(err));
        log.warn({ filePath: entry.relativePath, err: error.message }, 'Failed to process file');
        callbacks?.onError?.(entry.relativePath, error);
        scanProgressRepo.incrementError(scanId);
      }

      processedFiles++;
      reportProgress(callbacks, processedFiles + skippedFiles, totalFiles, entry.relativePath);

      // Flush batch
      if (batch.length >= config.batchSize) {
        photoRepo.batchInsert(batch);
        batch.length = 0;
        scanProgressRepo.updateProgress(scanId, processedFiles, skippedFiles, entry.relativePath);
      }
    }

    // Flush remaining batch
    if (batch.length > 0) {
      photoRepo.batchInsert(batch);
    }

    scanProgressRepo.complete(scanId);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    scanProgressRepo.fail(scanId, error.message);
    throw err;
  }

  const durationMs = Date.now() - startTime;
  const result: ScanResult = { totalFiles, processedFiles, skippedFiles, errorCount, durationMs };

  log.info({
    ...result,
    durationSec: Math.round(durationMs / 1000),
  }, 'Scan complete');

  callbacks?.onComplete?.(result);
  return result;
}

/**
 * Processes a single file: extracts metadata, generates thumbnail,
 * and returns a PhotoInsert ready for the database.
 */
async function processFile(entry: FileEntry, config: ScanConfig): Promise<PhotoInsert> {
  // Run EXIF extraction and media info in parallel
  const [exif, mediaInfo] = await Promise.all([
    extractExif(entry.absolutePath),
    getMediaInfo(entry.absolutePath),
  ]);

  // Generate thumbnail (unless disabled)
  let thumbnailPath: string | null = null;
  if (config.generateThumbnails) {
    thumbnailPath = await generateThumbnail(
      entry.absolutePath,
      entry.fileName,
      mediaInfo.isVideo,
      {
        size: 400,
        quality: 80,
        outputDir: config.thumbnailDir,
      },
    );
  }

  // Use EXIF dimensions if available, fall back to media info (video probe)
  const width = exif.width ?? mediaInfo.width;
  const height = exif.height ?? mediaInfo.height;

  // Use EXIF date if available, fall back to file mtime
  const dateTaken = exif.dateTaken?.toISOString() ?? null;

  return {
    file_path: entry.relativePath,
    file_name: entry.fileName,
    file_hash: entry.fileName, // Filename IS the hash in this NAS structure
    file_size: entry.fileSize,
    mime_type: mediaInfo.mimeType,
    width,
    height,
    duration: mediaInfo.duration,
    date_taken: dateTaken,
    date_modified: entry.dateModified.toISOString(),
    camera_make: exif.cameraMake,
    camera_model: exif.cameraModel,
    lens: exif.lens,
    gps_lat: exif.gpsLat,
    gps_lng: exif.gpsLng,
    orientation: exif.orientation,
    is_video: mediaInfo.isVideo ? 1 : 0,
    is_favorite: 0,
    thumbnail_path: thumbnailPath,
    folder_path: entry.folderPath,
  };
}

/**
 * Limits concurrent async operations to a maximum count.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      if (task) {
        results[currentIndex] = await task();
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

function reportProgress(
  callbacks: Partial<ScanCallbacks> | undefined,
  current: number,
  total: number,
  filePath: string,
): void {
  callbacks?.onProgress?.(current, total, filePath);
}
