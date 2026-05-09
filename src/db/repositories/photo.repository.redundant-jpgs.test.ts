import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { PhotoRepository } from './photo.repository.js';
import { makeTestDb, makePhotoInsert } from '../../test-helpers.js';

/**
 * Coverage for the JPG-twin identification + trash_reason scoping.
 *
 * Pair detection rules (per CLAUDE.md NAS naming):
 *   - file_name is the basename without extension (so "IMG_1234.jpg" and
 *     "IMG_1234.heic" both have file_name="IMG_1234")
 *   - same folder_path required (don't cross-pair across directories)
 *   - both must be live (deleted_at IS NULL)
 *
 * Trash scoping:
 *   - getTrashed / getAllTrashed / getTrashStats / getExpiredTrash exclude
 *     'jpg-redundant' so the /trash UI + auto-purge cron leave staged JPGs
 *     alone
 */
describe('Redundant-JPG identification + trash_reason scoping', () => {
  let db: Database.Database;
  let repo: PhotoRepository;

  beforeEach(() => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('findRedundantJpgs', () => {
    it('finds JPG with HEIC sibling in the same folder', () => {
      repo.batchInsert([
        makePhotoInsert({
          file_path: '2024/event/IMG_1234.jpg', file_name: 'IMG_1234',
          file_hash: 'IMG_1234j', mime_type: 'image/jpeg', folder_path: '2024/event',
          file_size: 3_000_000,
        }),
        makePhotoInsert({
          file_path: '2024/event/IMG_1234.heic', file_name: 'IMG_1234',
          file_hash: 'IMG_1234h', mime_type: 'image/heic', folder_path: '2024/event',
          file_size: 2_000_000,
        }),
      ]);

      const pairs = repo.findRedundantJpgs();
      expect(pairs).toHaveLength(1);
      expect(pairs[0]!.jpg_path).toBe('2024/event/IMG_1234.jpg');
      expect(pairs[0]!.heic_path).toBe('2024/event/IMG_1234.heic');
      expect(pairs[0]!.jpg_size).toBe(3_000_000);
      expect(pairs[0]!.heic_size).toBe(2_000_000);
    });

    it('matches both .heic and .heif as the HEIC side', () => {
      repo.batchInsert([
        makePhotoInsert({
          file_path: '2024/IMG_A.jpg', file_name: 'IMG_A',
          file_hash: 'a1', mime_type: 'image/jpeg', folder_path: '2024',
        }),
        makePhotoInsert({
          file_path: '2024/IMG_A.heif', file_name: 'IMG_A',
          file_hash: 'a2', mime_type: 'image/heif', folder_path: '2024',
        }),
      ]);
      expect(repo.findRedundantJpgs()).toHaveLength(1);
    });

    it('matches case-insensitively on basename (IMG_A.jpg ↔ img_a.heic)', () => {
      // The on-disk walker preserves case in file_name. iPhone outputs are
      // consistent within a single export run, but across years a user may
      // have mixed case from different conversion tools.
      repo.batchInsert([
        makePhotoInsert({
          file_path: '2024/IMG_A.jpg', file_name: 'IMG_A',
          file_hash: 'a1', mime_type: 'image/jpeg', folder_path: '2024',
        }),
        makePhotoInsert({
          file_path: '2024/img_a.heic', file_name: 'img_a',
          file_hash: 'a2', mime_type: 'image/heic', folder_path: '2024',
        }),
      ]);
      expect(repo.findRedundantJpgs()).toHaveLength(1);
    });

    it('does NOT pair across different folders', () => {
      repo.batchInsert([
        makePhotoInsert({
          file_path: '2024/event-A/IMG.jpg', file_name: 'IMG',
          file_hash: 'a1', mime_type: 'image/jpeg', folder_path: '2024/event-A',
        }),
        makePhotoInsert({
          file_path: '2024/event-B/IMG.heic', file_name: 'IMG',
          file_hash: 'b1', mime_type: 'image/heic', folder_path: '2024/event-B',
        }),
      ]);
      expect(repo.findRedundantJpgs()).toHaveLength(0);
    });

    it('does NOT include trashed photos', () => {
      repo.batchInsert([
        makePhotoInsert({
          file_path: '2024/IMG.jpg', file_name: 'IMG',
          file_hash: 'a1', mime_type: 'image/jpeg', folder_path: '2024',
        }),
        makePhotoInsert({
          file_path: '2024/IMG.heic', file_name: 'IMG',
          file_hash: 'a2', mime_type: 'image/heic', folder_path: '2024',
        }),
      ]);
      // Mark the JPG as already trashed
      const jpg = db.prepare("SELECT id FROM photos WHERE mime_type = 'image/jpeg'").get() as { id: number };
      repo.markTrashed(jpg.id, '.trash/2026-05/IMG.jpg', 'user');

      expect(repo.findRedundantJpgs()).toHaveLength(0);
    });

    it('returns multiple pairs sorted by jpg_path', () => {
      const inserts = ['B', 'A', 'C'].flatMap((name) => [
        makePhotoInsert({
          file_path: `2024/${name}.jpg`, file_name: name,
          file_hash: `${name}-j`, mime_type: 'image/jpeg', folder_path: '2024',
        }),
        makePhotoInsert({
          file_path: `2024/${name}.heic`, file_name: name,
          file_hash: `${name}-h`, mime_type: 'image/heic', folder_path: '2024',
        }),
      ]);
      repo.batchInsert(inserts);

      const pairs = repo.findRedundantJpgs();
      expect(pairs.map((p) => p.jpg_path)).toEqual([
        '2024/A.jpg', '2024/B.jpg', '2024/C.jpg',
      ]);
    });

    it('does not match a JPG with an unrelated PNG (only HEIC/HEIF qualify)', () => {
      repo.batchInsert([
        makePhotoInsert({
          file_path: '2024/X.jpg', file_name: 'X',
          file_hash: 'x1', mime_type: 'image/jpeg', folder_path: '2024',
        }),
        makePhotoInsert({
          file_path: '2024/X.png', file_name: 'X',
          file_hash: 'x2', mime_type: 'image/png', folder_path: '2024',
        }),
      ]);
      expect(repo.findRedundantJpgs()).toHaveLength(0);
    });
  });

  describe('trash_reason scoping', () => {
    function seedTrashed(name: string, reason: 'user' | 'jpg-redundant'): number {
      repo.batchInsert([
        makePhotoInsert({
          file_path: `2024/${name}.jpg`, file_name: name,
          file_hash: `${name}-h`, mime_type: 'image/jpeg', folder_path: '2024',
        }),
      ]);
      const id = (db.prepare('SELECT id FROM photos WHERE file_name = ?').get(name) as { id: number }).id;
      repo.markTrashed(id, `.trash/2026-05/${name}.jpg`, reason);
      return id;
    }

    it('getTrashed excludes jpg-redundant rows', () => {
      seedTrashed('user-deleted', 'user');
      seedTrashed('redundant-1', 'jpg-redundant');
      seedTrashed('redundant-2', 'jpg-redundant');

      const result = repo.getTrashed({ limit: 100, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.photos[0]!.file_name).toBe('user-deleted');
    });

    it('getAllTrashed excludes jpg-redundant rows', () => {
      seedTrashed('a', 'user');
      seedTrashed('b', 'jpg-redundant');
      const all = repo.getAllTrashed();
      expect(all.map((p) => p.file_name)).toEqual(['a']);
    });

    it('getExpiredTrash excludes jpg-redundant (so cron auto-purge skips them)', () => {
      const userId = seedTrashed('old-user', 'user');
      const stagedId = seedTrashed('old-staged', 'jpg-redundant');
      // Backdate both to 60 days ago
      db.prepare("UPDATE photos SET deleted_at = datetime('now', '-60 days') WHERE id IN (?, ?)").run(userId, stagedId);

      const expired = repo.getExpiredTrash(30);
      expect(expired.map((p) => p.file_name)).toEqual(['old-user']);
    });

    it('getTrashStats excludes jpg-redundant from the count badge', () => {
      seedTrashed('a', 'user');
      seedTrashed('b', 'jpg-redundant');
      seedTrashed('c', 'jpg-redundant');

      const stats = repo.getTrashStats();
      expect(stats.count).toBe(1);
    });

    it('legacy NULL trash_reason is treated as user-trash (backwards compat)', () => {
      // Simulate a row that was trashed before migration 014
      repo.batchInsert([
        makePhotoInsert({ file_path: '2024/legacy.jpg', file_name: 'legacy', file_hash: 'l1' }),
      ]);
      const id = (db.prepare("SELECT id FROM photos WHERE file_name = 'legacy'").get() as { id: number }).id;
      // markTrashed sets trash_reason='user' by default; manually NULL it to simulate legacy
      repo.markTrashed(id, '.trash/2026-05/legacy.jpg', 'user');
      db.prepare('UPDATE photos SET trash_reason = NULL WHERE id = ?').run(id);

      expect(repo.getTrashed({ limit: 100, offset: 0 }).total).toBe(1);
      expect(repo.getAllTrashed()).toHaveLength(1);
      expect(repo.getTrashStats().count).toBe(1);
    });
  });
});
