import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { FaceRepository } from './face.repository.js';
import { PhotoRepository } from './photo.repository.js';
import { makeTestDb, makePhotoInsert } from '../../test-helpers.js';

/**
 * Coverage for the wrongly-clustered-person fix path:
 *   - reassignFacesInPhotos correctly moves faces between people
 *   - photo_count is recalculated on both source and destination
 *   - photos that don't contain a face from the source person are skipped
 */
describe('FaceRepository.reassignFacesInPhotos', () => {
  let db: Database.Database;
  let faceRepo: FaceRepository;
  let photoRepo: PhotoRepository;
  let p1Id: number, p2Id: number, p3Id: number;
  let personA: number, personB: number;

  function emb(): Buffer {
    // Empty 128-dim float32 — content doesn't matter for these tests
    return Buffer.from(new Float32Array(128).buffer);
  }

  beforeEach(() => {
    db = makeTestDb();
    faceRepo = new FaceRepository(db);
    photoRepo = new PhotoRepository(db);

    // 3 photos
    photoRepo.batchInsert([
      makePhotoInsert({ file_path: 'p1.jpg', file_name: 'p1', file_hash: 'h1' }),
      makePhotoInsert({ file_path: 'p2.jpg', file_name: 'p2', file_hash: 'h2' }),
      makePhotoInsert({ file_path: 'p3.jpg', file_name: 'p3', file_hash: 'h3' }),
    ]);
    const rows = db.prepare('SELECT id, file_path FROM photos ORDER BY id').all() as Array<{ id: number; file_path: string }>;
    p1Id = rows.find((r) => r.file_path === 'p1.jpg')!.id;
    p2Id = rows.find((r) => r.file_path === 'p2.jpg')!.id;
    p3Id = rows.find((r) => r.file_path === 'p3.jpg')!.id;

    // Two people; A has the wrongly-merged faces
    personA = faceRepo.createPerson('Daughter A (wrongly merged)', 'named');
    personB = faceRepo.createPerson('Daughter B', 'named');

    // Person A "owns" a face in every photo
    faceRepo.insertFace({ photo_id: p1Id, person_id: personA, embedding: emb(), x: 0, y: 0, width: 50, height: 50, confidence: 0.95 });
    faceRepo.insertFace({ photo_id: p2Id, person_id: personA, embedding: emb(), x: 0, y: 0, width: 50, height: 50, confidence: 0.95 });
    faceRepo.insertFace({ photo_id: p3Id, person_id: personA, embedding: emb(), x: 0, y: 0, width: 50, height: 50, confidence: 0.95 });

    // Photo p1 ALSO has another, unrelated face (e.g., Mom in the same shot)
    // assigned to neither person — verifies we don't sweep up unrelated faces.
    faceRepo.insertFace({ photo_id: p1Id, person_id: null, embedding: emb(), x: 100, y: 100, width: 50, height: 50, confidence: 0.95 });

    // Recompute photo_count baselines
    faceRepo.updatePersonPhotoCount(personA);
    faceRepo.updatePersonPhotoCount(personB);
  });

  afterEach(() => {
    db.close();
  });

  it('moves matching faces in the given photos from source to destination person', () => {
    const reassigned = faceRepo.reassignFacesInPhotos(personA, personB, [p1Id, p2Id]);
    expect(reassigned).toBe(2);

    const rows = db.prepare('SELECT photo_id, person_id FROM faces').all() as Array<{ photo_id: number; person_id: number | null }>;
    const personByPhoto = (id: number): Array<number | null> => rows.filter((r) => r.photo_id === id).map((r) => r.person_id);

    // p1 and p2: now belong to personB; p3: still personA
    expect(personByPhoto(p1Id)).toContain(personB);
    expect(personByPhoto(p2Id)).toContain(personB);
    expect(personByPhoto(p3Id)).toContain(personA);

    // The unrelated null-person face in p1 should be untouched
    expect(personByPhoto(p1Id)).toContain(null);
  });

  it('updates photo_count on both source and destination', () => {
    faceRepo.reassignFacesInPhotos(personA, personB, [p1Id, p2Id]);

    expect(faceRepo.getPerson(personA)!.photo_count).toBe(1); // only p3 left
    expect(faceRepo.getPerson(personB)!.photo_count).toBe(2); // p1 + p2
  });

  it('skips photos that have no face linked to the source person (silent no-op)', () => {
    // p3 has personA's face; p1Id is correct but personB has no faces yet —
    // calling with a photo whose only personA-face was already moved should
    // be a no-op for that photo.
    faceRepo.reassignFacesInPhotos(personA, personB, [p1Id]); // moves 1
    const second = faceRepo.reassignFacesInPhotos(personA, personB, [p1Id]); // already moved
    expect(second).toBe(0);
  });

  it('returns 0 for empty photo list and same-person reassignment', () => {
    expect(faceRepo.reassignFacesInPhotos(personA, personB, [])).toBe(0);
    expect(faceRepo.reassignFacesInPhotos(personA, personA, [p1Id])).toBe(0);
  });

  it('round-trip: split half then merge back', () => {
    // Move p1+p2 to personB
    faceRepo.reassignFacesInPhotos(personA, personB, [p1Id, p2Id]);
    expect(faceRepo.getPerson(personA)!.photo_count).toBe(1);
    expect(faceRepo.getPerson(personB)!.photo_count).toBe(2);

    // Move them back
    const back = faceRepo.reassignFacesInPhotos(personB, personA, [p1Id, p2Id]);
    expect(back).toBe(2);
    expect(faceRepo.getPerson(personA)!.photo_count).toBe(3);
    expect(faceRepo.getPerson(personB)!.photo_count).toBe(0);
  });
});
