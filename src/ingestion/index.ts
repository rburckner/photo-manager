import { watch } from 'node:fs';
import { readdir, stat, unlink, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { SUPPORTED_EXTENSIONS } from '../shared/constants.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

export interface IngestResult {
  file: string;
  hash: string;
  action: 'imported' | 'duplicate' | 'skipped' | 'error';
  destination?: string;
  error?: string;
}

/**
 * Processes all files in the inbox directory:
 * 1. Hash each file (SHA-256)
 * 2. Check if hash exists in DB (duplicate)
 * 3. Move to NAS structure: {mediaRoot}/inbox/{YYYY-MM-DD}/{hash}{ext}
 * 4. Return results for each file
 */
export async function processInbox(
  inboxDir: string,
  mediaRoot: string,
  photoRepo: PhotoRepository,
): Promise<IngestResult[]> {
  const log = getLogger();
  const results: IngestResult[] = [];

  let entries;
  try {
    entries = await readdir(inboxDir, { withFileTypes: true });
  } catch {
    log.warn({ inboxDir }, 'Inbox directory not accessible');
    return results;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      results.push({ file: entry.name, hash: '', action: 'skipped' });
      continue;
    }

    const filePath = join(inboxDir, entry.name);

    try {
      // Hash the file
      const fileBuffer = await readFile(filePath);
      const hash = createHash('sha256').update(fileBuffer).digest('hex');

      // Check for duplicates
      const existing = photoRepo.findByHash(hash);
      if (existing.length > 0) {
        log.info({ file: entry.name, hash }, 'Duplicate found, skipping');
        results.push({ file: entry.name, hash, action: 'duplicate' });
        continue;
      }

      // Determine destination: {mediaRoot}/inbox/{date}/{hash}{ext}
      const fileStat = await stat(filePath);
      const date = fileStat.mtime.toISOString().slice(0, 10);
      const destDir = join(mediaRoot, 'inbox', date);
      const destPath = join(destDir, `${hash}${ext}`);

      await mkdir(destDir, { recursive: true });
      // Use read+write+delete (rename and copyFile fail across filesystems/GVFS)
      await writeFile(destPath, fileBuffer);
      await unlink(filePath);

      log.info({ file: entry.name, hash, destination: destPath }, 'File ingested');
      results.push({
        file: entry.name,
        hash,
        action: 'imported',
        destination: `inbox/${date}/${hash}${ext}`,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn({ file: entry.name, error }, 'Failed to ingest file');
      results.push({ file: entry.name, hash: '', action: 'error', error });
    }
  }

  return results;
}

/**
 * Starts watching the inbox directory for new files.
 * Processes files after a short debounce to handle bulk drops.
 */
export function startInboxWatcher(
  config: AppConfig,
  photoRepo: PhotoRepository,
): void {
  const log = getLogger();
  const inboxDir = config.dropboxDir;

  // Ensure inbox dir exists
  mkdir(inboxDir, { recursive: true }).catch(() => {});

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    watch(inboxDir, { recursive: false }, (_eventType, _filename) => {
      // Debounce — wait 2s after last change before processing
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void processInbox(inboxDir, config.mediaRoot, photoRepo).then((results) => {
          const imported = results.filter((r) => r.action === 'imported').length;
          const duplicates = results.filter((r) => r.action === 'duplicate').length;
          if (imported > 0 || duplicates > 0) {
            log.info({ imported, duplicates }, 'Inbox processed');
          }
        });
      }, 2000);
    });

    log.info({ inboxDir }, 'Inbox watcher started');
  } catch {
    log.warn({ inboxDir }, 'Could not start inbox watcher — directory may not exist');
  }
}
