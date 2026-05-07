import { watch } from 'node:fs';
import { readdir, stat, unlink, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { SUPPORTED_EXTENSIONS } from '../shared/constants.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { processFile } from '../scanner/index.js';
import type { AppConfig, FileEntry, ScanConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

export interface IngestResult {
  file: string;
  hash: string;
  action: 'imported' | 'duplicate' | 'skipped' | 'error';
  destination?: string;
  error?: string;
  indexed?: boolean;
}

/**
 * Ingest a single file given its raw bytes and original filename.
 * Used by both the inbox watcher and the upload endpoint.
 */
export async function ingestBuffer(
  fileBuffer: Buffer,
  originalName: string,
  config: AppConfig,
  photoRepo: PhotoRepository,
): Promise<IngestResult> {
  const log = getLogger();
  const ext = extname(originalName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { file: originalName, hash: '', action: 'skipped' };
  }

  try {
    const hash = createHash('sha256').update(fileBuffer).digest('hex');

    const existing = photoRepo.findByHash(hash);
    if (existing.length > 0) {
      return { file: originalName, hash, action: 'duplicate' };
    }

    const date = new Date().toISOString().slice(0, 10);
    const destRel = join('inbox', date, `${hash}${ext}`);
    const destPath = join(config.mediaRoot, destRel);

    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, fileBuffer);

    const destStat = await stat(destPath);
    const folderPath = dirname(destRel);
    const fileEntry: FileEntry = {
      absolutePath: destPath,
      relativePath: destRel,
      folderPath: folderPath === '.' ? '' : folderPath,
      fileName: hash,
      fileSize: destStat.size,
      dateModified: destStat.mtime,
    };

    const scanConfig: ScanConfig = {
      rootPath: config.mediaRoot,
      mediaRoot: config.mediaRoot,
      thumbnailDir: config.thumbnailDir,
      generateThumbnails: true,
      concurrency: 1,
      batchSize: 1,
      force: false,
      dryRun: false,
    };

    let indexed = false;
    try {
      const photoInsert = await processFile(fileEntry, scanConfig);
      photoRepo.batchInsert([photoInsert]);
      indexed = true;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn({ file: originalName, hash, destination: destPath, error }, 'File copied but indexing failed — will be picked up by next scan');
    }

    return {
      file: originalName,
      hash,
      action: 'imported',
      destination: destRel,
      indexed,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn({ file: originalName, error }, 'Failed to ingest file');
    return { file: originalName, hash: '', action: 'error', error };
  }
}

/**
 * Processes all files in the inbox directory:
 * 1. Hash each file (SHA-256)
 * 2. Check if hash exists in DB (duplicate)
 * 3. Move to NAS structure: {mediaRoot}/inbox/{YYYY-MM-DD}/{hash}{ext}
 * 4. Index the imported file (EXIF, thumbnail, DB row) so it appears in the UI immediately
 * 5. Return results for each file
 */
export async function processInbox(
  config: AppConfig,
  photoRepo: PhotoRepository,
): Promise<IngestResult[]> {
  const log = getLogger();
  const results: IngestResult[] = [];
  const inboxDir = config.dropboxDir;
  const mediaRoot = config.mediaRoot;

  const scanConfig: ScanConfig = {
    rootPath: mediaRoot,
    mediaRoot,
    thumbnailDir: config.thumbnailDir,
    generateThumbnails: true,
    concurrency: 1,
    batchSize: 1,
    force: false,
    dryRun: false,
  };

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
        log.info({ file: entry.name, hash }, 'Duplicate found, removing from inbox');
        await unlink(filePath);
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

      // Index the freshly-copied file so it shows up in the UI immediately,
      // matching the schema produced by a normal scan.
      const destStat = await stat(destPath);
      const relativePath = relative(mediaRoot, destPath);
      const folderPath = dirname(relativePath);
      const fileEntry: FileEntry = {
        absolutePath: destPath,
        relativePath,
        folderPath: folderPath === '.' ? '' : folderPath,
        fileName: hash,
        fileSize: destStat.size,
        dateModified: destStat.mtime,
      };

      let indexed = false;
      try {
        const photoInsert = await processFile(fileEntry, scanConfig);
        photoRepo.batchInsert([photoInsert]);
        indexed = true;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        log.warn({ file: entry.name, hash, destination: destPath, error }, 'File copied but indexing failed — will be picked up by next scan');
      }

      log.info({ file: entry.name, hash, destination: destPath, indexed }, 'File ingested');
      results.push({
        file: entry.name,
        hash,
        action: 'imported',
        destination: `inbox/${date}/${hash}${ext}`,
        indexed,
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
        void processInbox(config, photoRepo).then((results) => {
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

  // Periodic poll as fallback (fs.watch can miss events on some filesystems)
  setInterval(() => {
    void processInbox(config, photoRepo).then((results) => {
      const imported = results.filter((r) => r.action === 'imported').length;
      const duplicates = results.filter((r) => r.action === 'duplicate').length;
      if (imported > 0 || duplicates > 0) {
        log.info({ imported, duplicates }, 'Inbox poll processed');
      }
    });
  }, 60000); // Check every 60 seconds
}
