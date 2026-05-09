import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PhotoRepository } from '../db/repositories/photo.repository.js';
import { getLogger } from '../shared/logger.js';

export interface ReconcileResult {
  checked: number;
  missing: number;
  cleared: number;
}

/**
 * Walk every photo with thumbnail_path SET, stat the file, NULL the column
 * for any whose file is missing on disk. Self-heals drift between the DB
 * and the thumbnail cache (manual cleanup, partial scan, mass deletion).
 *
 * Does not regenerate thumbnails — callers handle that step. After this
 * runs, `getPhotosWithoutThumbnails(...)` will see the freshly-NULLed rows
 * and the standard backfill path will produce them.
 */
export function reconcileThumbnails(
  photoRepo: PhotoRepository,
  thumbnailDir: string,
  options: { dryRun?: boolean } = {},
): ReconcileResult {
  const log = getLogger();
  const rows = photoRepo.getPhotosWithThumbnailPath();
  let missing = 0;
  let cleared = 0;
  for (const row of rows) {
    const full = join(thumbnailDir, row.thumbnail_path);
    if (!existsSync(full)) {
      missing++;
      if (!options.dryRun) {
        photoRepo.clearThumbnailPath(row.id);
        cleared++;
      }
    }
  }
  log.debug(
    { checked: rows.length, missing, cleared, dryRun: options.dryRun ?? false },
    'Thumbnail reconciliation',
  );
  return { checked: rows.length, missing, cleared };
}
