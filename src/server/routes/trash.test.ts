import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { trashRoutes } from './trash.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { makeTestDb, makePhotoInsert } from '../../test-helpers.js';
import type { AppConfig, PhotoRow } from '../../shared/types.js';

describe('trash routes', () => {
  let db: Database.Database;
  let repo: PhotoRepository;
  let app: FastifyInstance;
  let workDir: string;
  let config: AppConfig;

  beforeEach(async () => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
    workDir = mkdtempSync(join(tmpdir(), 'pm-trash-test-'));
    mkdirSync(join(workDir, 'media', '2024', 'event'), { recursive: true });
    mkdirSync(join(workDir, 'thumbs'), { recursive: true });
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

    app = Fastify({ logger: false });
    await app.register(trashRoutes, { photoRepo: repo, config });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(workDir, { recursive: true, force: true });
    db.close();
  });

  /** Seed a live (non-trashed) photo with the file present on disk. */
  function seedLivePhoto(hash: string, contents = 'photo-bytes'): { id: number; row: PhotoRow } {
    const relPath = `2024/event/${hash}.jpg`;
    repo.batchInsert([makePhotoInsert({
      file_path: relPath,
      file_name: hash,
      file_hash: hash,
      file_size: contents.length,
      thumbnail_path: `${hash.slice(0, 2)}/${hash}.jpg`,
    })]);
    const row = (db.prepare('SELECT * FROM photos WHERE file_hash = ?').get(hash)) as PhotoRow;
    writeFileSync(join(config.mediaRoot, relPath), contents);
    // Thumbnail
    mkdirSync(join(config.thumbnailDir, hash.slice(0, 2)), { recursive: true });
    writeFileSync(join(config.thumbnailDir, hash.slice(0, 2), `${hash}.jpg`), 'thumb-bytes');
    return { id: row.id, row };
  }

  describe('POST /api/photos/:id/trash', () => {
    it('moves the file into .trash/{YYYY-MM}/ and updates DB fields', async () => {
      const { id } = seedLivePhoto('abc1');
      const srcAbs = join(config.mediaRoot, '2024/event/abc1.jpg');

      const res = await app.inject({
        method: 'POST',
        url: `/api/photos/${id}/trash`,
        remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, moved: true });

      // Source file is gone
      expect(existsSync(srcAbs)).toBe(false);

      // Trash file exists at .trash/{YYYY-MM}/{hash}{ext}
      const updated = repo.findById(id)!;
      expect(updated.deleted_at).not.toBeNull();
      expect(updated.trash_path).toMatch(/^\.trash\/\d{4}-\d{2}\/abc1\.jpg$/);
      expect(updated.original_path).toBe('2024/event/abc1.jpg');
      expect(updated.file_path).toBe(updated.trash_path); // file_path tracks current location
      expect(existsSync(join(config.mediaRoot, updated.trash_path!))).toBe(true);
    });

    it('preserves file contents byte-for-byte through the rename', async () => {
      const { id } = seedLivePhoto('abc2', 'unique-content-bytes-12345');

      await app.inject({
        method: 'POST',
        url: `/api/photos/${id}/trash`,
        remoteAddress: '127.0.0.1',
      });

      const updated = repo.findById(id)!;
      const content = readFileSync(join(config.mediaRoot, updated.trash_path!), 'utf-8');
      expect(content).toBe('unique-content-bytes-12345');
    });

    it('rejects with 403 when called from a non-private IP', async () => {
      const { id } = seedLivePhoto('abc3');

      const res = await app.inject({
        method: 'POST',
        url: `/api/photos/${id}/trash`,
        remoteAddress: '8.8.8.8',
      });

      expect(res.statusCode).toBe(403);
      // File still on disk in original location
      expect(existsSync(join(config.mediaRoot, '2024/event/abc3.jpg'))).toBe(true);
    });

    it('returns 404 when the photo id does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/photos/99999/trash',
        remoteAddress: '127.0.0.1',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/photos/:id/restore', () => {
    it('moves the file back to original_path and clears trash fields', async () => {
      const { id } = seedLivePhoto('rst1');

      // Trash it first
      await app.inject({
        method: 'POST', url: `/api/photos/${id}/trash`, remoteAddress: '127.0.0.1',
      });
      const trashed = repo.findById(id)!;
      const trashAbs = join(config.mediaRoot, trashed.trash_path!);
      expect(existsSync(trashAbs)).toBe(true);

      // Restore it
      const res = await app.inject({
        method: 'POST', url: `/api/photos/${id}/restore`, remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, restored: true });

      // File is back at the original path
      expect(existsSync(join(config.mediaRoot, '2024/event/rst1.jpg'))).toBe(true);
      // Trash file is gone
      expect(existsSync(trashAbs)).toBe(false);

      // DB fields are cleared
      const restored = repo.findById(id)!;
      expect(restored.deleted_at).toBeNull();
      expect(restored.trash_path).toBeNull();
      expect(restored.original_path).toBeNull();
      expect(restored.file_path).toBe('2024/event/rst1.jpg');
    });
  });

  describe('DELETE /api/photos/:id/forever', () => {
    it('unlinks the trash file + thumbnail and removes the DB row', async () => {
      const { id } = seedLivePhoto('prg1');

      // Trash, then permanently delete
      await app.inject({
        method: 'POST', url: `/api/photos/${id}/trash`, remoteAddress: '127.0.0.1',
      });
      const trashed = repo.findById(id)!;
      const trashAbs = join(config.mediaRoot, trashed.trash_path!);
      const thumbAbs = join(config.thumbnailDir, 'pr', 'prg1.jpg');
      expect(existsSync(trashAbs)).toBe(true);
      expect(existsSync(thumbAbs)).toBe(true);

      const res = await app.inject({
        method: 'DELETE', url: `/api/photos/${id}/forever`, remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, purged: true });
      expect(existsSync(trashAbs)).toBe(false);
      expect(existsSync(thumbAbs)).toBe(false);
      expect(repo.findById(id)).toBeUndefined();
    });

    it('refuses to permanently delete a photo that is not in trash', async () => {
      const { id } = seedLivePhoto('prg2');

      const res = await app.inject({
        method: 'DELETE', url: `/api/photos/${id}/forever`, remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(400);
      expect(repo.findById(id)).toBeDefined();
      expect(existsSync(join(config.mediaRoot, '2024/event/prg2.jpg'))).toBe(true);
    });

    it('still purges the DB row when the trash file is already gone (ENOENT tolerance)', async () => {
      const { id } = seedLivePhoto('prg3');

      await app.inject({
        method: 'POST', url: `/api/photos/${id}/trash`, remoteAddress: '127.0.0.1',
      });
      const trashed = repo.findById(id)!;
      const trashAbs = join(config.mediaRoot, trashed.trash_path!);
      // Manually unlink the trash file before purge
      rmSync(trashAbs);

      const res = await app.inject({
        method: 'DELETE', url: `/api/photos/${id}/forever`, remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, purged: true });
      expect(repo.findById(id)).toBeUndefined();
    });
  });

  describe('round-trip: trash → restore → trash again', () => {
    it('keeps file content intact across multiple cycles', async () => {
      const { id } = seedLivePhoto('rt1', 'round-trip-bytes');

      // Cycle 1
      await app.inject({ method: 'POST', url: `/api/photos/${id}/trash`, remoteAddress: '127.0.0.1' });
      await app.inject({ method: 'POST', url: `/api/photos/${id}/restore`, remoteAddress: '127.0.0.1' });
      // Cycle 2
      await app.inject({ method: 'POST', url: `/api/photos/${id}/trash`, remoteAddress: '127.0.0.1' });
      await app.inject({ method: 'POST', url: `/api/photos/${id}/restore`, remoteAddress: '127.0.0.1' });

      const finalRow = repo.findById(id)!;
      expect(finalRow.deleted_at).toBeNull();
      const content = readFileSync(join(config.mediaRoot, finalRow.file_path), 'utf-8');
      expect(content).toBe('round-trip-bytes');
    });
  });

  describe('rename failure handling (read-only NAS)', () => {
    it('returns 503 with a graceful error and leaves the file in place when trash rename fails', async () => {
      const { id } = seedLivePhoto('ro1');
      const srcAbs = join(config.mediaRoot, '2024/event/ro1.jpg');

      // Make the mediaRoot read-only so mkdir(.trash/...) fails with EACCES.
      chmodSync(config.mediaRoot, 0o555);

      try {
        const res = await app.inject({
          method: 'POST',
          url: `/api/photos/${id}/trash`,
          remoteAddress: '127.0.0.1',
        });

        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body) as { ok: boolean; error: string };
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/Could not move file to trash/i);

        // File still in place; DB row still un-trashed
        expect(existsSync(srcAbs)).toBe(true);
        expect(repo.findById(id)!.deleted_at).toBeNull();
      } finally {
        chmodSync(config.mediaRoot, 0o755);
      }
    });

    it('returns 503 with a graceful error when restore rename fails', async () => {
      const { id } = seedLivePhoto('ro2');

      // Trash succeeds (writable), then we lock down the destination's parent dir
      // so rename() back into it raises EACCES.
      await app.inject({ method: 'POST', url: `/api/photos/${id}/trash`, remoteAddress: '127.0.0.1' });

      const destParent = join(config.mediaRoot, '2024', 'event');
      chmodSync(destParent, 0o555);

      try {
        const res = await app.inject({
          method: 'POST',
          url: `/api/photos/${id}/restore`,
          remoteAddress: '127.0.0.1',
        });

        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body) as { ok: boolean; error: string };
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/Could not restore file/i);

        // DB row still trashed
        expect(repo.findById(id)!.deleted_at).not.toBeNull();
      } finally {
        chmodSync(destParent, 0o755);
      }
    });
  });

  describe('POST /api/trash/empty', () => {
    it('purges all trashed photos and leaves live ones alone', async () => {
      const { id: id1 } = seedLivePhoto('em1');
      const { id: id2 } = seedLivePhoto('em2');
      const { id: liveId } = seedLivePhoto('em3');

      await app.inject({ method: 'POST', url: `/api/photos/${id1}/trash`, remoteAddress: '127.0.0.1' });
      await app.inject({ method: 'POST', url: `/api/photos/${id2}/trash`, remoteAddress: '127.0.0.1' });

      const res = await app.inject({
        method: 'POST', url: '/api/trash/empty', remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ purged: 2 });
      expect(repo.findById(id1)).toBeUndefined();
      expect(repo.findById(id2)).toBeUndefined();
      expect(repo.findById(liveId)).toBeDefined();
      // Live photo's file is still on disk
      expect(existsSync(join(config.mediaRoot, '2024/event/em3.jpg'))).toBe(true);
    });
  });

  describe('POST /api/trash/restore-all', () => {
    it('restores every trashed photo back to its original_path', async () => {
      const { id: id1 } = seedLivePhoto('ra1');
      const { id: id2 } = seedLivePhoto('ra2');
      await app.inject({ method: 'POST', url: `/api/photos/${id1}/trash`, remoteAddress: '127.0.0.1' });
      await app.inject({ method: 'POST', url: `/api/photos/${id2}/trash`, remoteAddress: '127.0.0.1' });

      const res = await app.inject({
        method: 'POST', url: '/api/trash/restore-all', remoteAddress: '127.0.0.1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { restored: number };
      expect(body.restored).toBe(2);
      expect(existsSync(join(config.mediaRoot, '2024/event/ra1.jpg'))).toBe(true);
      expect(existsSync(join(config.mediaRoot, '2024/event/ra2.jpg'))).toBe(true);
      expect(repo.findById(id1)!.deleted_at).toBeNull();
      expect(repo.findById(id2)!.deleted_at).toBeNull();
    });
  });
});
