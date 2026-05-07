import type Database from 'better-sqlite3';

export interface TagRow {
  id: number;
  name: string;
  color: string | null;
}

export class TagRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Array<TagRow & { photo_count: number }> {
    return this.db.prepare(`
      SELECT t.*, count(CASE WHEN p.deleted_at IS NULL THEN pt.photo_id END) as photo_count
      FROM tags t
      LEFT JOIN photo_tags pt ON pt.tag_id = t.id
      LEFT JOIN photos p ON p.id = pt.photo_id
      GROUP BY t.id
      ORDER BY t.name
    `).all() as Array<TagRow & { photo_count: number }>;
  }

  findById(id: number): TagRow | undefined {
    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;
  }

  create(name: string, color?: string): TagRow {
    const result = this.db.prepare(
      'INSERT INTO tags (name, color) VALUES (?, ?)',
    ).run(name, color ?? null);
    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) throw new Error('Tag insert succeeded but row not found');
    return created;
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM photo_tags WHERE tag_id = ?').run(id);
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  addToPhotos(tagId: number, photoIds: number[]): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)',
    );
    const run = this.db.transaction((ids: number[]) => {
      for (const photoId of ids) {
        stmt.run(photoId, tagId);
      }
    });
    run(photoIds);
  }

  removeFromPhotos(tagId: number, photoIds: number[]): void {
    const stmt = this.db.prepare(
      'DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?',
    );
    const run = this.db.transaction((ids: number[]) => {
      for (const photoId of ids) {
        stmt.run(photoId, tagId);
      }
    });
    run(photoIds);
  }

  getTagsForPhoto(photoId: number): TagRow[] {
    return this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN photo_tags pt ON pt.tag_id = t.id
      WHERE pt.photo_id = ?
    `).all(photoId) as TagRow[];
  }

  getPhotosByTag(tagId: number, limit: number, offset: number): { photoIds: number[]; total: number } {
    const photoIds = (this.db.prepare(`
      SELECT pt.photo_id FROM photo_tags pt
      JOIN photos p ON p.id = pt.photo_id
      WHERE pt.tag_id = ? AND p.deleted_at IS NULL
      ORDER BY pt.photo_id DESC LIMIT ? OFFSET ?
    `).all(tagId, limit, offset) as Array<{ photo_id: number }>).map((r) => r.photo_id);

    const total = (this.db.prepare(`
      SELECT count(*) as count FROM photo_tags pt
      JOIN photos p ON p.id = pt.photo_id
      WHERE pt.tag_id = ? AND p.deleted_at IS NULL
    `).get(tagId) as { count: number }).count;

    return { photoIds, total };
  }
}
