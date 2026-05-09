import type Database from 'better-sqlite3';

export interface PersonRow {
  id: number;
  name: string | null;
  status: 'named' | 'hidden' | 'ignored' | 'unreviewed';
  photo_count: number;
  created_at: string;
}

export interface FaceRow {
  id: number;
  photo_id: number;
  person_id: number | null;
  embedding: Buffer;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  created_at: string;
}

export class FaceRepository {
  constructor(private readonly db: Database.Database) {}

  // ── People ──

  listPeople(includeIgnored: boolean = false): PersonRow[] {
    const where = includeIgnored ? '' : "WHERE status != 'ignored'";
    // Order priority:
    //   1. status group: visible first (named/unreviewed), then hidden, then ignored
    //   2. named before unnamed within each status group
    //   3. alphabetical by name (case-insensitive)
    //   4. photo_count DESC as tiebreaker for unnamed clusters
    return this.db.prepare(`
      SELECT * FROM people ${where}
      ORDER BY
        CASE
          WHEN status = 'ignored' THEN 2
          WHEN status = 'hidden'  THEN 1
          ELSE 0
        END,
        CASE WHEN name IS NULL OR name = '' THEN 1 ELSE 0 END,
        LOWER(COALESCE(name, '')) ASC,
        photo_count DESC
    `).all() as PersonRow[];
  }

  getPerson(id: number): PersonRow | undefined {
    return this.db.prepare('SELECT * FROM people WHERE id = ?').get(id) as PersonRow | undefined;
  }

  createPerson(name: string | null, status: string = 'unreviewed'): number {
    const result = this.db.prepare(
      'INSERT INTO people (name, status) VALUES (?, ?)',
    ).run(name, status);
    return Number(result.lastInsertRowid);
  }

  updatePerson(id: number, data: { name?: string; status?: string }): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  updatePersonPhotoCount(personId: number): void {
    const count = (this.db.prepare(`
      SELECT count(DISTINCT f.photo_id) as c FROM faces f
      JOIN photos p ON p.id = f.photo_id
      WHERE f.person_id = ? AND p.deleted_at IS NULL
    `).get(personId) as { c: number }).c;
    this.db.prepare('UPDATE people SET photo_count = ? WHERE id = ?').run(count, personId);
  }

  getUnreviewedPeople(): PersonRow[] {
    return this.db.prepare(
      "SELECT * FROM people WHERE status = 'unreviewed' ORDER BY photo_count DESC",
    ).all() as PersonRow[];
  }

  // ── Faces ──

  insertFace(data: {
    photo_id: number;
    person_id: number | null;
    embedding: Buffer;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }): number {
    const result = this.db.prepare(`
      INSERT INTO faces (photo_id, person_id, embedding, x, y, width, height, confidence)
      VALUES (@photo_id, @person_id, @embedding, @x, @y, @width, @height, @confidence)
    `).run(data);
    return Number(result.lastInsertRowid);
  }

  getFaceById(id: number): FaceRow | undefined {
    return this.db.prepare('SELECT * FROM faces WHERE id = ?').get(id) as FaceRow | undefined;
  }

  getFacesByPhoto(photoId: number): FaceRow[] {
    return this.db.prepare(
      'SELECT * FROM faces WHERE photo_id = ?',
    ).all(photoId) as FaceRow[];
  }

  getFacesByPerson(personId: number, limit: number = 100, offset: number = 0): FaceRow[] {
    return this.db.prepare(`
      SELECT f.* FROM faces f
      JOIN photos p ON p.id = f.photo_id
      WHERE f.person_id = ? AND p.deleted_at IS NULL
      LIMIT ? OFFSET ?
    `).all(personId, limit, offset) as FaceRow[];
  }

  getPhotoIdsByPerson(personId: number): number[] {
    return (this.db.prepare(`
      SELECT DISTINCT f.photo_id FROM faces f
      JOIN photos p ON p.id = f.photo_id
      WHERE f.person_id = ? AND p.deleted_at IS NULL
      ORDER BY f.photo_id DESC
    `).all(personId) as Array<{ photo_id: number }>).map((r) => r.photo_id);
  }

  getAllEmbeddings(): Array<{ id: number; person_id: number | null; embedding: Buffer }> {
    return this.db.prepare(
      'SELECT id, person_id, embedding FROM faces',
    ).all() as Array<{ id: number; person_id: number | null; embedding: Buffer }>;
  }

  assignFacesToPerson(faceIds: number[], personId: number): void {
    const stmt = this.db.prepare('UPDATE faces SET person_id = ? WHERE id = ?');
    const run = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(personId, id);
      }
    });
    run(faceIds);
  }

  mergePeople(keepId: number, mergeId: number): void {
    // Move all faces from mergeId to keepId
    this.db.prepare('UPDATE faces SET person_id = ? WHERE person_id = ?').run(keepId, mergeId);
    // Delete the merged person
    this.db.prepare('DELETE FROM people WHERE id = ?').run(mergeId);
    // Update photo count
    this.updatePersonPhotoCount(keepId);
  }

  /**
   * Reassign faces of `fromPersonId` in the given photos to `toPersonId`.
   *
   * Handles the "wrongly clustered" case — e.g. clustering merged two
   * children's faces into one person, and the user wants to split a subset
   * of those photos out to a different person.
   *
   * Updates photo_count on both people. Returns the number of face rows
   * actually reassigned. If a photo doesn't contain a face linked to
   * fromPersonId, it's silently skipped (no-op).
   */
  reassignFacesInPhotos(fromPersonId: number, toPersonId: number, photoIds: number[]): number {
    if (photoIds.length === 0 || fromPersonId === toPersonId) return 0;

    const placeholders = photoIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `UPDATE faces SET person_id = ? WHERE person_id = ? AND photo_id IN (${placeholders})`,
    );

    const tx = this.db.transaction((): number => {
      const result = stmt.run(toPersonId, fromPersonId, ...photoIds);
      this.updatePersonPhotoCount(fromPersonId);
      this.updatePersonPhotoCount(toPersonId);
      return result.changes;
    });

    return tx();
  }

  // ── Scan tracking ──

  isPhotoScanned(photoId: number): boolean {
    return this.db.prepare(
      'SELECT 1 FROM face_scan_status WHERE photo_id = ?',
    ).get(photoId) !== undefined;
  }

  markPhotoScanned(photoId: number, faceCount: number): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO face_scan_status (photo_id, face_count) VALUES (?, ?)',
    ).run(photoId, faceCount);
  }

  getUnscannedPhotoIds(limit: number): number[] {
    return (this.db.prepare(`
      SELECT p.id FROM photos p
      LEFT JOIN face_scan_status fs ON fs.photo_id = p.id
      WHERE fs.photo_id IS NULL AND p.is_video = 0 AND p.deleted_at IS NULL
      ORDER BY p.date_taken DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number }>).map((r) => r.id);
  }

  // ── Representative face for a person (for the circle avatar) ──

  getRepresentativeFace(personId: number): (FaceRow & { photo_id: number }) | undefined {
    return this.db.prepare(`
      SELECT f.* FROM faces f
      JOIN photos p ON p.id = f.photo_id
      WHERE f.person_id = ? AND p.deleted_at IS NULL
      ORDER BY f.confidence DESC LIMIT 1
    `).get(personId) as (FaceRow & { photo_id: number }) | undefined;
  }
}
