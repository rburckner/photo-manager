import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { processDirectory, type Callbacks } from './import-takeout.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { makeTestDb, makePhotoInsert } from '../../test-helpers.js';

function makeCallbacks(): Callbacks & { counts: { import: number; duplicate: number; skip: number; error: number } } {
  const counts = { import: 0, duplicate: 0, skip: 0, error: 0 };
  return {
    counts,
    onImport: () => counts.import++,
    onDuplicate: () => counts.duplicate++,
    onSkip: () => counts.skip++,
    onError: () => counts.error++,
  };
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('processDirectory (Google Takeout import)', () => {
  let db: Database.Database;
  let repo: PhotoRepository;
  let workDir: string;
  let takeoutDir: string;
  let mediaRoot: string;

  beforeEach(() => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
    workDir = mkdtempSync(join(tmpdir(), 'pm-takeout-test-'));
    takeoutDir = join(workDir, 'takeout');
    mediaRoot = join(workDir, 'media');
    mkdirSync(takeoutDir, { recursive: true });
    mkdirSync(mediaRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    db.close();
  });

  it('imports a media file into {mediaRoot}/imported/{date}/{hash}{ext} and removes the source', async () => {
    const sourceJpg = join(takeoutDir, 'photo.jpg');
    writeFileSync(sourceJpg, 'jpeg-bytes');
    const expectedHash = sha256('jpeg-bytes');

    // Takeout JSON metadata sets the photoTakenTime
    const ts = Math.floor(new Date('2023-06-15T10:00:00Z').getTime() / 1000);
    writeFileSync(`${sourceJpg}.json`, JSON.stringify({
      photoTakenTime: { timestamp: String(ts) },
    }));

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, false, cb);

    expect(cb.counts.import).toBe(1);
    expect(cb.counts.duplicate).toBe(0);
    expect(cb.counts.error).toBe(0);

    // Destination file exists at the timestamp's date
    const destPath = join(mediaRoot, 'imported', '2023-06-15', `${expectedHash}.jpg`);
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf-8')).toBe('jpeg-bytes');

    // Source is gone (Takeout import is move, not copy)
    expect(existsSync(sourceJpg)).toBe(false);
  });

  it('falls back to file mtime when no JSON metadata is present', async () => {
    const sourceJpg = join(takeoutDir, 'no-meta.jpg');
    writeFileSync(sourceJpg, 'no-meta-bytes');
    const expectedHash = sha256('no-meta-bytes');

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, false, cb);

    expect(cb.counts.import).toBe(1);
    // Date directory exists somewhere under imported/
    const importedRoot = join(mediaRoot, 'imported');
    expect(existsSync(importedRoot)).toBe(true);
    const dateDirs = readdirSync(importedRoot);
    expect(dateDirs.length).toBe(1);
    // The single date dir should match YYYY-MM-DD
    expect(dateDirs[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(existsSync(join(importedRoot, dateDirs[0]!, `${expectedHash}.jpg`))).toBe(true);
  });

  it('treats files whose hash already exists in DB as duplicates and does not move them', async () => {
    const sourceJpg = join(takeoutDir, 'dupe.jpg');
    writeFileSync(sourceJpg, 'dupe-bytes');
    const hash = sha256('dupe-bytes');

    // Pre-seed the DB so this hash already exists
    repo.batchInsert([makePhotoInsert({
      file_path: 'preexisting/dupe.jpg',
      file_name: 'dupe',
      file_hash: hash,
    })]);

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, false, cb);

    expect(cb.counts.duplicate).toBe(1);
    expect(cb.counts.import).toBe(0);
    // Source is left in place — duplicate detection does not delete
    expect(existsSync(sourceJpg)).toBe(true);
    // Nothing was written under imported/
    expect(existsSync(join(mediaRoot, 'imported'))).toBe(false);
  });

  it('skips JSON-only and unsupported files (recording them as skips)', async () => {
    writeFileSync(join(takeoutDir, 'orphan.json'), '{}');
    writeFileSync(join(takeoutDir, 'note.txt'), 'unrelated');
    writeFileSync(join(takeoutDir, 'doc.pdf'), 'pdf');

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, false, cb);

    expect(cb.counts.skip).toBe(3);
    expect(cb.counts.import).toBe(0);
    expect(existsSync(join(mediaRoot, 'imported'))).toBe(false);
  });

  it('dryRun mode counts imports but does not touch the filesystem', async () => {
    const sourceJpg = join(takeoutDir, 'dry.jpg');
    writeFileSync(sourceJpg, 'dry-bytes');

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, true, cb);

    expect(cb.counts.import).toBe(1);
    // Source still in place
    expect(existsSync(sourceJpg)).toBe(true);
    // Nothing written under imported/
    expect(existsSync(join(mediaRoot, 'imported'))).toBe(false);
  });

  it('recurses into nested takeout subdirectories (Google Photos/{album}/{file})', async () => {
    mkdirSync(join(takeoutDir, 'Google Photos', 'Album-A'), { recursive: true });
    mkdirSync(join(takeoutDir, 'Google Photos', 'Album-B'), { recursive: true });
    writeFileSync(join(takeoutDir, 'Google Photos', 'Album-A', 'a.jpg'), 'a');
    writeFileSync(join(takeoutDir, 'Google Photos', 'Album-B', 'b.jpg'), 'b');

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, false, cb);

    expect(cb.counts.import).toBe(2);
  });

  it('continues past files whose JSON metadata is malformed (uses mtime fallback)', async () => {
    const sourceJpg = join(takeoutDir, 'bad-meta.jpg');
    writeFileSync(sourceJpg, 'bad-meta-bytes');
    writeFileSync(`${sourceJpg}.json`, '{not valid json'); // malformed

    const cb = makeCallbacks();
    await processDirectory(takeoutDir, takeoutDir, mediaRoot, repo, false, cb);

    // Still imports successfully — falls back to mtime
    expect(cb.counts.import).toBe(1);
    expect(cb.counts.error).toBe(0);
  });
});
