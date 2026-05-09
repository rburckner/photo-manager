import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { PhotoRepository } from './photo.repository.js';
import { FaceRepository } from './face.repository.js';
import { makeTestDb, makePhotoInsert } from '../../test-helpers.js';

/**
 * Coverage for Feature A (hide-person filtering) + Feature B (show_hidden override).
 *
 * Setup: 3 photos
 *   p1 — has a face belonging to a person whose status will toggle
 *   p2 — has the per-photo `is_hidden = 1` flag set
 *   p3 — completely clean (no faces, not hidden)
 */
describe('PhotoRepository hidden-person filter', () => {
  let db: Database.Database;
  let photoRepo: PhotoRepository;
  let faceRepo: FaceRepository;
  let p1Id: number, p2Id: number, p3Id: number;
  let personId: number;

  function setShowHidden(value: 'true' | 'false'): void {
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'show_hidden'").run(value);
  }

  function ids(rows: Array<{ id: number }>): number[] {
    return rows.map((r) => r.id).sort((a, b) => a - b);
  }

  beforeEach(() => {
    db = makeTestDb();
    photoRepo = new PhotoRepository(db);
    faceRepo = new FaceRepository(db);

    // Seed three photos
    photoRepo.batchInsert([
      makePhotoInsert({ file_path: 'p1.jpg', file_name: 'p1', file_hash: 'h1', is_favorite: 1, gps_lat: 1.0, gps_lng: 1.0, date_taken: '2024-06-01T12:00:00.000Z' }),
      makePhotoInsert({ file_path: 'p2.jpg', file_name: 'p2', file_hash: 'h2', is_favorite: 1, gps_lat: 2.0, gps_lng: 2.0, date_taken: '2024-06-02T12:00:00.000Z' }),
      makePhotoInsert({ file_path: 'p3.jpg', file_name: 'p3', file_hash: 'h3', is_favorite: 1, gps_lat: 3.0, gps_lng: 3.0, date_taken: '2024-06-03T12:00:00.000Z' }),
    ]);
    const rows = db.prepare('SELECT id, file_path FROM photos ORDER BY id').all() as Array<{ id: number; file_path: string }>;
    p1Id = rows.find((r) => r.file_path === 'p1.jpg')!.id;
    p2Id = rows.find((r) => r.file_path === 'p2.jpg')!.id;
    p3Id = rows.find((r) => r.file_path === 'p3.jpg')!.id;

    // Mark p2 as per-photo hidden
    photoRepo.bulkSetHidden([p2Id], true);

    // Create a "person" (initially named, not hidden) and attach a face to p1
    personId = faceRepo.createPerson('Test Person', 'named');
    faceRepo.insertFace({
      photo_id: p1Id,
      person_id: personId,
      embedding: Buffer.from(new Float32Array(128).buffer),
      x: 0, y: 0, width: 50, height: 50, confidence: 0.95,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('default mode (show_hidden=false)', () => {
    it('list() excludes per-photo hidden AND photos containing hidden-person faces', () => {
      // Mark the person as hidden — p1 should now disappear too
      faceRepo.updatePerson(personId, { status: 'hidden' });

      const result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p3Id]);
      expect(result.total).toBe(1);
    });

    it('list() includes photos with non-hidden persons', () => {
      // Person stays "named" — p1 should still be visible
      const result = photoRepo.list({ limit: 100, offset: 0 });
      // p2 hidden per-photo, p1 + p3 visible
      expect(ids(result.photos)).toEqual([p1Id, p3Id]);
    });

    it('list({ folder }) applies the filter inside a folder', () => {
      faceRepo.updatePerson(personId, { status: 'hidden' });
      // All seeded photos have folder_path='test'
      const result = photoRepo.list({ limit: 100, offset: 0, folder: 'test' });
      expect(ids(result.photos)).toEqual([p3Id]);
    });

    it('getFavorites() filters hidden-person photos', () => {
      faceRepo.updatePerson(personId, { status: 'hidden' });
      const result = photoRepo.getFavorites(100, 0);
      expect(ids(result.photos)).toEqual([p3Id]);
    });

    it('search() filters hidden-person photos', () => {
      faceRepo.updatePerson(personId, { status: 'hidden' });
      const result = photoRepo.search('p', 100, 0); // matches all three by file_name LIKE
      expect(ids(result.photos)).toEqual([p3Id]);
    });

    it('getStats() counts exclude hidden-person and per-photo-hidden photos', () => {
      faceRepo.updatePerson(personId, { status: 'hidden' });
      const stats = photoRepo.getStats();
      expect(stats.total).toBe(1); // only p3
    });

    it('getMapPoints() filters hidden-person photos', () => {
      faceRepo.updatePerson(personId, { status: 'hidden' });
      const points = photoRepo.getMapPoints(100);
      expect(ids(points)).toEqual([p3Id]);
    });

    it('person status "ignored" or "named" does NOT hide photos', () => {
      faceRepo.updatePerson(personId, { status: 'ignored' });
      let result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p1Id, p3Id]);

      faceRepo.updatePerson(personId, { status: 'unreviewed' });
      result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p1Id, p3Id]);
    });

    it('getTimeline() filters hidden-person photos', () => {
      faceRepo.updatePerson(personId, { status: 'hidden' });
      const photos = photoRepo.getTimeline({ limit: 100, offset: 0 });
      expect(ids(photos)).toEqual([p3Id]);
    });
  });

  describe('override mode (show_hidden=true)', () => {
    beforeEach(() => {
      setShowHidden('true');
      faceRepo.updatePerson(personId, { status: 'hidden' });
    });

    it('list() returns ALL non-trashed photos including per-photo-hidden and hidden-person', () => {
      const result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p1Id, p2Id, p3Id]);
      expect(result.total).toBe(3);
    });

    it('getFavorites() returns all favorites regardless of hidden state', () => {
      const result = photoRepo.getFavorites(100, 0);
      expect(ids(result.photos)).toEqual([p1Id, p2Id, p3Id]);
    });

    it('search() returns all matches regardless of hidden state', () => {
      const result = photoRepo.search('p', 100, 0);
      expect(ids(result.photos)).toEqual([p1Id, p2Id, p3Id]);
    });

    it('getStats() counts everything regardless of hidden state', () => {
      const stats = photoRepo.getStats();
      expect(stats.total).toBe(3);
    });

    it('flipping show_hidden back to "false" restores the filter', () => {
      let result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p1Id, p2Id, p3Id]);

      setShowHidden('false');
      result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p3Id]); // p1 hidden via person, p2 per-photo hidden
    });
  });

  describe('trashed photos always excluded', () => {
    it('show_hidden=true does NOT resurface trashed photos', () => {
      setShowHidden('true');
      photoRepo.markTrashed(p3Id, '.trash/2026-05/h3.jpg');
      const result = photoRepo.list({ limit: 100, offset: 0 });
      expect(ids(result.photos)).toEqual([p1Id, p2Id]);
    });
  });
});
