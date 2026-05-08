import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type Database from 'better-sqlite3';
import { runScan } from './index.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { ScanProgressRepository } from '../db/repositories/scan-progress.repository.js';
import { makeTestDb, makePhotoInsert } from '../test-helpers.js';
import type { ScanConfig } from '../shared/types.js';

async function makePng(filePath: string): Promise<void> {
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).png().toFile(filePath);
}

describe('runScan', () => {
  let db: Database.Database;
  let photoRepo: PhotoRepository;
  let progressRepo: ScanProgressRepository;
  let workDir: string;
  let baseConfig: ScanConfig;

  beforeEach(() => {
    db = makeTestDb();
    photoRepo = new PhotoRepository(db);
    progressRepo = new ScanProgressRepository(db);
    workDir = mkdtempSync(join(tmpdir(), 'pm-scan-test-'));
    mkdirSync(join(workDir, 'photos'), { recursive: true });
    mkdirSync(join(workDir, 'thumbs'), { recursive: true });
    baseConfig = {
      rootPath: join(workDir, 'photos'),
      mediaRoot: join(workDir, 'photos'),
      thumbnailDir: join(workDir, 'thumbs'),
      generateThumbnails: false,
      concurrency: 1,
      batchSize: 10,
      force: false,
      dryRun: false,
    };
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    db.close();
  });

  it('reports zero counts when the root has no media', async () => {
    const result = await runScan(baseConfig, photoRepo, progressRepo);
    expect(result.totalFiles).toBe(0);
    expect(result.processedFiles).toBe(0);
  });

  it('skips files whose mtime matches a previously indexed row', async () => {
    // Drop two .png files under the scan root
    const fileA = join(baseConfig.rootPath, 'a.png');
    const fileB = join(baseConfig.rootPath, 'b.png');
    await makePng(fileA);
    await makePng(fileB);

    // Pre-populate the DB with the *exact* mtime for fileA so it skips
    const { statSync } = await import('node:fs');
    const mtimeA = statSync(fileA).mtime.toISOString();
    photoRepo.batchInsert([
      makePhotoInsert({
        file_path: 'a.png',
        file_name: 'a',
        file_hash: 'a',
        date_modified: mtimeA,
      }),
    ]);

    const result = await runScan({ ...baseConfig, dryRun: true }, photoRepo, progressRepo);

    expect(result.totalFiles).toBe(2);
    expect(result.skippedFiles).toBe(1); // a.png — mtime match
    expect(result.processedFiles).toBe(1); // b.png — no row, dryRun "processes" it
  });

  it('does not write DB rows in dryRun mode', async () => {
    await makePng(join(baseConfig.rootPath, 'new.png'));

    const before = photoRepo.list({ limit: 100, offset: 0 }).total;
    const result = await runScan({ ...baseConfig, dryRun: true }, photoRepo, progressRepo);
    const after = photoRepo.list({ limit: 100, offset: 0 }).total;

    expect(result.processedFiles).toBe(1);
    expect(after).toBe(before);
  });

  it('force=true reprocesses even when mtime matches the existing row', async () => {
    const file = join(baseConfig.rootPath, 'force.png');
    await makePng(file);
    const { statSync } = await import('node:fs');
    const mtime = statSync(file).mtime.toISOString();
    photoRepo.batchInsert([
      makePhotoInsert({
        file_path: 'force.png',
        file_name: 'force',
        file_hash: 'force',
        date_modified: mtime,
      }),
    ]);

    const result = await runScan({ ...baseConfig, dryRun: true, force: true }, photoRepo, progressRepo);

    expect(result.skippedFiles).toBe(0);
    expect(result.processedFiles).toBe(1);
  });

  it('records a scan_progress row on success', async () => {
    await makePng(join(baseConfig.rootPath, 'one.png'));

    await runScan({ ...baseConfig, dryRun: true }, photoRepo, progressRepo);

    const latest = progressRepo.getLatest();
    expect(latest).toBeDefined();
    expect(latest!.status).toBe('completed');
    expect(latest!.total_files).toBe(1);
  });
});
