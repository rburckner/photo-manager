import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { runAutoPurge } from './cron.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import type { AppConfig } from '../shared/types.js';
import { makeTestDb, makePhotoInsert } from '../test-helpers.js';

describe('runAutoPurge', () => {
  let db: Database.Database;
  let repo: PhotoRepository;
  let workDir: string;
  let config: AppConfig;

  beforeEach(() => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
    workDir = mkdtempSync(join(tmpdir(), 'pm-purge-test-'));
    mkdirSync(join(workDir, 'media', '.trash', '2026-03'), { recursive: true });
    mkdirSync(join(workDir, 'thumbs', 'ab'), { recursive: true });
    config = {
      mediaRoot: join(workDir, 'media'),
      dropboxDir: join(workDir, 'inbox'),
      thumbnailDir: join(workDir, 'thumbs'),
      dbPath: ':memory:',
      serverPort: 3000,
      serverHost: '0.0.0.0',
      scanConcurrency: 1,
      scanBatchSize: 1,
      thumbnailSize: 400,
      thumbnailQuality: 80,
      logLevel: 'error',
    };
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    db.close();
  });

  function seedTrashedPhoto(daysAgo: number, hash = 'abc123', size = 1000): number {
    repo.batchInsert([makePhotoInsert({
      file_hash: hash,
      file_path: `2024/event/${hash}.jpg`,
      file_name: hash,
      file_size: size,
      thumbnail_path: `${hash.slice(0, 2)}/${hash}.jpg`,
    })]);
    const id = (db.prepare('SELECT id FROM photos ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
    const trashRel = `.trash/2026-03/${hash}.jpg`;
    db.prepare(
      "UPDATE photos SET deleted_at = datetime('now', ? ), trash_path = ?, original_path = ?, file_path = ? WHERE id = ?",
    ).run(`-${daysAgo} days`, trashRel, `2024/event/${hash}.jpg`, trashRel, id);
    // Create the on-disk file
    writeFileSync(join(config.mediaRoot, trashRel), 'trash-content');
    // Create a fake thumbnail (ensure subdirectory exists)
    const thumbDir = join(config.thumbnailDir, hash.slice(0, 2));
    mkdirSync(thumbDir, { recursive: true });
    writeFileSync(join(thumbDir, `${hash}.jpg`), 'thumb-bytes');
    return id;
  }

  it('purges photos older than the retention window and unlinks their files', async () => {
    seedTrashedPhoto(60, 'expired');

    const result = await runAutoPurge(config, repo);

    expect(result.purged).toBe(1);
    expect(result.errors).toBe(0);
    expect(repo.findById(1)).toBeUndefined();
    expect(existsSync(join(config.mediaRoot, '.trash/2026-03/expired.jpg'))).toBe(false);
    // Thumbnail also removed
    expect(existsSync(join(config.thumbnailDir, 'ex/expired.jpg'))).toBe(false);
  });

  it('leaves photos within the retention window alone', async () => {
    const id = seedTrashedPhoto(5, 'recent');

    const result = await runAutoPurge(config, repo);

    expect(result.purged).toBe(0);
    expect(repo.findById(id)).toBeDefined();
    expect(existsSync(join(config.mediaRoot, '.trash/2026-03/recent.jpg'))).toBe(true);
  });

  it('purges expired and preserves recent in the same run', async () => {
    seedTrashedPhoto(60, 'old1');
    seedTrashedPhoto(60, 'old2');
    seedTrashedPhoto(2, 'newish');

    const result = await runAutoPurge(config, repo);

    expect(result.purged).toBe(2);
    expect(repo.getTrashStats().count).toBe(1);
  });

  it('still purges DB row even if trash file is already missing', async () => {
    const id = seedTrashedPhoto(60, 'gone');
    // Manually remove the file before running purge
    rmSync(join(config.mediaRoot, '.trash/2026-03/gone.jpg'));

    const result = await runAutoPurge(config, repo);

    // ENOENT is treated as already-cleaned, not as an error
    expect(result.purged).toBe(1);
    expect(result.errors).toBe(0);
    expect(repo.findById(id)).toBeUndefined();
  });

  it('returns 0/0 when trash is empty', async () => {
    const result = await runAutoPurge(config, repo);
    expect(result).toEqual({ purged: 0, errors: 0 });
  });
});
