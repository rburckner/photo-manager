import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { processInbox } from './index.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import type { AppConfig } from '../shared/types.js';
import { makeTestDb, makePhotoInsert } from '../test-helpers.js';

describe('processInbox', () => {
  let db: Database.Database;
  let repo: PhotoRepository;
  let workDir: string;
  let config: AppConfig;

  beforeEach(() => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
    workDir = mkdtempSync(join(tmpdir(), 'pm-ingest-test-'));
    mkdirSync(join(workDir, 'inbox'));
    mkdirSync(join(workDir, 'media'));
    mkdirSync(join(workDir, 'thumbs'));
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

  it('skips files with unsupported extensions', async () => {
    writeFileSync(join(config.dropboxDir, 'note.txt'), 'hello');

    const results = await processInbox(config, repo);

    expect(results).toHaveLength(1);
    expect(results[0]?.action).toBe('skipped');
    // Unsupported file is left in inbox (not unlinked)
    expect(existsSync(join(config.dropboxDir, 'note.txt'))).toBe(true);
  });

  it('imports a new image, removes it from inbox, and creates a DB row', async () => {
    // Tiny but valid 1x1 JPEG (10-byte JFIF header + minimal data)
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0xff, 0xd9,
    ]);
    writeFileSync(join(config.dropboxDir, 'shot.jpg'), jpegBytes);

    const results = await processInbox(config, repo);

    expect(results).toHaveLength(1);
    expect(results[0]?.action).toBe('imported');
    expect(results[0]?.destination).toMatch(/^inbox\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{64}\.jpg$/);
    // Original file removed from inbox
    expect(existsSync(join(config.dropboxDir, 'shot.jpg'))).toBe(false);
    // New file is in mediaRoot
    const dest = results[0]?.destination;
    expect(dest && existsSync(join(config.mediaRoot, dest))).toBe(true);
  });

  it('marks duplicates and removes them from inbox without re-importing', async () => {
    const bytes = Buffer.from('fake-image-bytes');
    const hash = createHash('sha256').update(bytes).digest('hex');

    // Pre-seed the DB with the same hash
    repo.batchInsert([makePhotoInsert({
      file_hash: hash,
      file_path: '2024/existing.jpg',
      file_name: hash,
    })]);

    writeFileSync(join(config.dropboxDir, 'duplicate.jpg'), bytes);

    const results = await processInbox(config, repo);

    expect(results).toHaveLength(1);
    expect(results[0]?.action).toBe('duplicate');
    expect(results[0]?.hash).toBe(hash);
    // Duplicate file unlinked from inbox
    expect(existsSync(join(config.dropboxDir, 'duplicate.jpg'))).toBe(false);
    // Existing DB row is unchanged
    expect(repo.findByHash(hash)).toHaveLength(1);
  });

  it('returns empty results when inbox does not exist', async () => {
    rmSync(config.dropboxDir, { recursive: true });
    const results = await processInbox(config, repo);
    expect(results).toEqual([]);
  });

  it('processes multiple files in one call', async () => {
    writeFileSync(join(config.dropboxDir, 'note.txt'), 'skip me');
    writeFileSync(join(config.dropboxDir, 'a.jpg'), Buffer.from('content-a'));
    writeFileSync(join(config.dropboxDir, 'b.jpg'), Buffer.from('content-b'));

    const results = await processInbox(config, repo);

    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.action === 'skipped')).toHaveLength(1);
    // a.jpg and b.jpg both produce results — either imported or error
    // (indexing may fail on fake JPEG bytes but the file copy should succeed)
    const handled = results.filter((r) => r.action === 'imported' || r.action === 'error');
    expect(handled).toHaveLength(2);
    // Files were removed from inbox after processing
    expect(readdirSync(config.dropboxDir).filter((f) => f.endsWith('.jpg'))).toEqual([]);
  });
});
