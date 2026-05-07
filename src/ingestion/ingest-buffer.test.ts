import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ingestBuffer } from './index.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import type { AppConfig } from '../shared/types.js';
import { makeTestDb, makePhotoInsert } from '../test-helpers.js';

describe('ingestBuffer', () => {
  let db: Database.Database;
  let repo: PhotoRepository;
  let workDir: string;
  let config: AppConfig;

  beforeEach(() => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
    workDir = mkdtempSync(join(tmpdir(), 'pm-upload-test-'));
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
    const result = await ingestBuffer(Buffer.from('hello'), 'note.txt', config, repo);
    expect(result.action).toBe('skipped');
    // Nothing was written
    expect(readdirSync(join(workDir, 'media'))).toEqual([]);
  });

  it('returns duplicate action when hash exists in DB and does not write the file', async () => {
    const bytes = Buffer.from('fake-bytes');
    const hash = createHash('sha256').update(bytes).digest('hex');
    repo.batchInsert([makePhotoInsert({
      file_hash: hash,
      file_path: '2024/existing.jpg',
      file_name: hash,
    })]);

    const result = await ingestBuffer(bytes, 'phone.jpg', config, repo);

    expect(result.action).toBe('duplicate');
    expect(result.hash).toBe(hash);
    // No file written for duplicates
    expect(readdirSync(join(workDir, 'media'))).toEqual([]);
  });

  it('writes the file under inbox/{date}/{hash}{ext} and reports imported', async () => {
    const bytes = Buffer.from('image-bytes-here');
    const result = await ingestBuffer(bytes, 'IMG_1234.JPG', config, repo);

    expect(result.action).toBe('imported');
    expect(result.destination).toMatch(/^inbox\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{64}\.jpg$/);
    const written = result.destination ? join(config.mediaRoot, result.destination) : '';
    expect(existsSync(written)).toBe(true);
  });

  it('lowercases the extension when computing destination path', async () => {
    const result = await ingestBuffer(Buffer.from('x'), 'FOO.JPEG', config, repo);
    expect(result.destination).toMatch(/\.jpeg$/);
    expect(result.destination).not.toMatch(/\.JPEG$/);
  });

  it('does not overwrite existing entries when hash differs', async () => {
    const bytes1 = Buffer.from('content-1');
    const bytes2 = Buffer.from('content-2');

    const r1 = await ingestBuffer(bytes1, 'a.jpg', config, repo);
    const r2 = await ingestBuffer(bytes2, 'b.jpg', config, repo);

    expect(r1.hash).not.toBe(r2.hash);
    expect(existsSync(join(config.mediaRoot, r1.destination ?? ''))).toBe(true);
    expect(existsSync(join(config.mediaRoot, r2.destination ?? ''))).toBe(true);
  });
});
