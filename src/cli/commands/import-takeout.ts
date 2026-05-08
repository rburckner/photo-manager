import { Command } from 'commander';
import { readdir, readFile, stat, copyFile, unlink, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger, getLogger } from '../../shared/logger.js';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants.js';

interface TakeoutMetadata {
  title?: string;
  description?: string;
  photoTakenTime?: { timestamp: string };
  geoData?: { latitude: number; longitude: number };
  geoDataExif?: { latitude: number; longitude: number };
}

export function createImportTakeoutCommand(): Command {
  return new Command('import-takeout')
    .description('Import photos from a Google Takeout export')
    .argument('<path>', 'Path to the Google Takeout folder (extracted)')
    .option('--dry-run', 'Show what would be imported without moving files')
    .option('-v, --verbose', 'Verbose logging')
    .action(async (takeoutPath: string, options: { dryRun?: boolean; verbose?: boolean }) => {
      const config = loadConfig();
      const log = initLogger({ logLevel: options.verbose ? 'debug' : config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);
      const photoRepo = new PhotoRepository(db);

      let imported = 0;
      let duplicates = 0;
      let skipped = 0;
      let errors = 0;

      log.info({ takeoutPath }, 'Scanning Google Takeout export');

      await processDirectory(takeoutPath, takeoutPath, config.mediaRoot, photoRepo, options.dryRun ?? false, {
        onImport: () => imported++,
        onDuplicate: () => duplicates++,
        onSkip: () => skipped++,
        onError: () => errors++,
      });

      console.log('\nGoogle Takeout import complete:');
      console.log(`  Imported:    ${imported}`);
      console.log(`  Duplicates:  ${duplicates}`);
      console.log(`  Skipped:     ${skipped}`);
      console.log(`  Errors:      ${errors}`);

      closeDb();
    });
}

export interface Callbacks {
  onImport: () => void;
  onDuplicate: () => void;
  onSkip: () => void;
  onError: () => void;
}

export async function processDirectory(
  currentPath: string,
  rootPath: string,
  mediaRoot: string,
  photoRepo: PhotoRepository,
  dryRun: boolean,
  callbacks: Callbacks,
): Promise<void> {
  const log = getLogger();
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(fullPath, rootPath, mediaRoot, photoRepo, dryRun, callbacks);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();

    // Skip JSON metadata files and non-media
    if (ext === '.json' || !SUPPORTED_EXTENSIONS.has(ext)) {
      callbacks.onSkip();
      continue;
    }

    try {
      // Read and hash the file
      const fileBuffer = await readFile(fullPath);
      const hash = createHash('sha256').update(fileBuffer).digest('hex');

      // Check for duplicates
      const existing = photoRepo.findByHash(hash);
      if (existing.length > 0) {
        log.debug({ file: entry.name, hash }, 'Duplicate');
        callbacks.onDuplicate();
        continue;
      }

      // Try to read Google Takeout JSON metadata
      const metadataPath = fullPath + '.json';
      let metadata: TakeoutMetadata | null = null;
      if (existsSync(metadataPath)) {
        try {
          const raw = await readFile(metadataPath, 'utf-8');
          metadata = JSON.parse(raw) as TakeoutMetadata;
        } catch {
          // Ignore bad JSON
        }
      }

      // Determine date for folder structure
      let date: string;
      if (metadata?.photoTakenTime?.timestamp) {
        const ts = parseInt(metadata.photoTakenTime.timestamp, 10) * 1000;
        date = new Date(ts).toISOString().slice(0, 10);
      } else {
        const fileStat = await stat(fullPath);
        date = fileStat.mtime.toISOString().slice(0, 10);
      }

      // Destination: {mediaRoot}/imported/{date}/{hash}{ext}
      const destDir = join(mediaRoot, 'imported', date);
      const destFile = `${hash}${ext}`;
      const destPath = join(destDir, destFile);

      if (dryRun) {
        log.info({ file: entry.name, dest: `imported/${date}/${destFile}` }, 'Would import');
      } else {
        await mkdir(destDir, { recursive: true });
        await copyFile(fullPath, destPath);
        await unlink(fullPath);
        log.debug({ file: entry.name, dest: destPath }, 'Imported');
      }

      callbacks.onImport();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn({ file: entry.name, error }, 'Import error');
      callbacks.onError();
    }
  }
}
