import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { PhotoRepository } from './photo.repository.js';
import { makeTestDb, makePhotoInsert } from '../../test-helpers.js';

describe('PhotoRepository trash methods', () => {
  let db: Database.Database;
  let repo: PhotoRepository;

  beforeEach(() => {
    db = makeTestDb();
    repo = new PhotoRepository(db);
  });

  function insertOne(overrides = {}): number {
    repo.batchInsert([makePhotoInsert(overrides)]);
    const row = db.prepare('SELECT id FROM photos ORDER BY id DESC LIMIT 1').get() as { id: number };
    return row.id;
  }

  describe('markTrashed', () => {
    it('sets deleted_at, trash_path, original_path, and updates file_path', () => {
      const id = insertOne({ file_path: '2024/event/abc.jpg' });
      repo.markTrashed(id, '.trash/2026-05/abc.jpg');
      const photo = repo.findById(id);
      expect(photo?.deleted_at).toBeTruthy();
      expect(photo?.trash_path).toBe('.trash/2026-05/abc.jpg');
      expect(photo?.original_path).toBe('2024/event/abc.jpg');
      expect(photo?.file_path).toBe('.trash/2026-05/abc.jpg');
    });

    it('is a no-op if the photo does not exist', () => {
      expect(() => { repo.markTrashed(99999, '.trash/x.jpg'); }).not.toThrow();
    });
  });

  describe('markRestored', () => {
    it('clears trash fields and restores file_path to original_path', () => {
      const id = insertOne({ file_path: '2024/event/abc.jpg' });
      repo.markTrashed(id, '.trash/2026-05/abc.jpg');
      repo.markRestored(id);
      const photo = repo.findById(id);
      expect(photo?.deleted_at).toBeNull();
      expect(photo?.trash_path).toBeNull();
      expect(photo?.original_path).toBeNull();
      expect(photo?.file_path).toBe('2024/event/abc.jpg');
    });

    it('is a no-op if the photo was never trashed', () => {
      const id = insertOne();
      expect(() => { repo.markRestored(id); }).not.toThrow();
      const photo = repo.findById(id);
      expect(photo?.deleted_at).toBeNull();
    });
  });

  describe('purgeRow', () => {
    it('removes the photo and its album/tag joins', () => {
      const id = insertOne();
      db.prepare('INSERT INTO albums (name) VALUES (?)').run('Test');
      const albumId = (db.prepare('SELECT id FROM albums').get() as { id: number }).id;
      db.prepare('INSERT INTO album_photos (album_id, photo_id) VALUES (?, ?)').run(albumId, id);
      db.prepare('INSERT INTO tags (name) VALUES (?)').run('TestTag');
      const tagId = (db.prepare('SELECT id FROM tags').get() as { id: number }).id;
      db.prepare('INSERT INTO photo_tags (photo_id, tag_id) VALUES (?, ?)').run(id, tagId);

      repo.purgeRow(id);

      expect(repo.findById(id)).toBeUndefined();
      expect(db.prepare('SELECT count(*) as c FROM album_photos WHERE photo_id = ?').get(id))
        .toEqual({ c: 0 });
      expect(db.prepare('SELECT count(*) as c FROM photo_tags WHERE photo_id = ?').get(id))
        .toEqual({ c: 0 });
    });
  });

  describe('getTrashed', () => {
    it('returns only trashed photos, ordered by deleted_at DESC', () => {
      const id1 = insertOne({ file_hash: 'a', file_path: 'a.jpg' });
      const id2 = insertOne({ file_hash: 'b', file_path: 'b.jpg' });
      const id3 = insertOne({ file_hash: 'c', file_path: 'c.jpg' });
      repo.markTrashed(id1, '.trash/a.jpg');
      // Insert id2 trash 1 second later so deleted_at differs
      db.prepare("UPDATE photos SET deleted_at = datetime('now', '+1 second'), trash_path = ?, original_path = ?, file_path = ? WHERE id = ?")
        .run('.trash/c.jpg', 'c.jpg', '.trash/c.jpg', id3);

      const { photos, total } = repo.getTrashed({ limit: 50, offset: 0 });
      expect(total).toBe(2);
      expect(photos.map((p) => p.id)).toEqual([id3, id1]);
      expect(photos.every((p) => p.deleted_at !== null)).toBe(true);
      // id2 was never trashed; should not appear
      expect(photos.find((p) => p.id === id2)).toBeUndefined();
    });
  });

  describe('getExpiredTrash', () => {
    it('returns only photos trashed beyond the retention window', () => {
      const idOld = insertOne({ file_hash: 'old', file_path: 'old.jpg' });
      const idRecent = insertOne({ file_hash: 'recent', file_path: 'recent.jpg' });
      // Mark old trash 60 days ago directly
      db.prepare("UPDATE photos SET deleted_at = datetime('now', '-60 days'), trash_path = ?, original_path = ?, file_path = ? WHERE id = ?")
        .run('.trash/old.jpg', 'old.jpg', '.trash/old.jpg', idOld);
      repo.markTrashed(idRecent, '.trash/recent.jpg');

      const expired = repo.getExpiredTrash(30);
      expect(expired.map((p) => p.id)).toEqual([idOld]);
    });

    it('returns empty when nothing is past retention', () => {
      const id = insertOne();
      repo.markTrashed(id, '.trash/x.jpg');
      expect(repo.getExpiredTrash(30)).toHaveLength(0);
    });
  });

  describe('getTrashStats', () => {
    it('counts trashed photos and sums their sizes', () => {
      const id1 = insertOne({ file_size: 1000, file_hash: 'a', file_path: 'a.jpg' });
      const id2 = insertOne({ file_size: 2500, file_hash: 'b', file_path: 'b.jpg' });
      insertOne({ file_size: 4000, file_hash: 'c', file_path: 'c.jpg' }); // active, not trashed
      repo.markTrashed(id1, '.trash/a.jpg');
      repo.markTrashed(id2, '.trash/b.jpg');

      const stats = repo.getTrashStats();
      expect(stats.count).toBe(2);
      expect(stats.totalSize).toBe(3500);
    });

    it('returns 0/0 when trash is empty', () => {
      insertOne();
      expect(repo.getTrashStats()).toEqual({ count: 0, totalSize: 0 });
    });
  });

  describe('active-state queries filter trashed photos', () => {
    it('list() excludes trashed', () => {
      const id1 = insertOne({ file_hash: 'a', file_path: 'a.jpg' });
      insertOne({ file_hash: 'b', file_path: 'b.jpg' });
      repo.markTrashed(id1, '.trash/a.jpg');

      const { photos, total } = repo.list({ limit: 50, offset: 0 });
      expect(total).toBe(1);
      expect(photos.find((p) => p.id === id1)).toBeUndefined();
    });

    it('getStats() excludes trashed from total', () => {
      const id1 = insertOne({ file_size: 1000, file_hash: 'a', file_path: 'a.jpg' });
      insertOne({ file_size: 2000, file_hash: 'b', file_path: 'b.jpg' });
      repo.markTrashed(id1, '.trash/a.jpg');

      const stats = repo.getStats();
      expect(stats.total).toBe(1);
      expect(stats.totalSize).toBe(2000);
    });

    it('countAll() excludes trashed', () => {
      const id1 = insertOne({ file_hash: 'a', file_path: 'a.jpg' });
      insertOne({ file_hash: 'b', file_path: 'b.jpg' });
      repo.markTrashed(id1, '.trash/a.jpg');

      expect(repo.countAll()).toBe(1);
    });
  });

  describe('findById and findByHash remain neutral (return trashed too)', () => {
    it('findById returns trashed photos so trash UI can read them', () => {
      const id = insertOne();
      repo.markTrashed(id, '.trash/x.jpg');
      expect(repo.findById(id)?.deleted_at).toBeTruthy();
    });

    it('findByHash returns trashed photos so ingestion duplicate-check still trips', () => {
      const id = insertOne({ file_hash: 'duphash' });
      repo.markTrashed(id, '.trash/x.jpg');
      expect(repo.findByHash('duphash')).toHaveLength(1);
    });
  });
});
