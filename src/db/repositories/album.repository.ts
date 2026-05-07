import type Database from 'better-sqlite3';
import type { AlbumRow, PhotoRow } from '../../shared/types.js';

export interface AlbumWithCover extends AlbumRow {
  photo_count: number;
  cover_thumbnail_path: string | null;
}

export interface AlbumCreate {
  name: string;
  description?: string;
}

export interface AlbumUpdate {
  name?: string;
  description?: string;
  cover_photo_id?: number | null;
}

export class AlbumRepository {
  constructor(private readonly db: Database.Database) {}

  list(): AlbumWithCover[] {
    return this.db.prepare(`
      SELECT
        a.*,
        count(CASE WHEN ap_p.deleted_at IS NULL THEN ap.photo_id END) as photo_count,
        CASE WHEN cp.deleted_at IS NULL THEN cp.thumbnail_path END as cover_thumbnail_path
      FROM albums a
      LEFT JOIN album_photos ap ON ap.album_id = a.id
      LEFT JOIN photos ap_p ON ap_p.id = ap.photo_id
      LEFT JOIN photos cp ON cp.id = a.cover_photo_id
      GROUP BY a.id
      ORDER BY a.updated_at DESC
    `).all() as AlbumWithCover[];
  }

  findById(id: number): AlbumRow | undefined {
    return this.db.prepare('SELECT * FROM albums WHERE id = ?').get(id) as AlbumRow | undefined;
  }

  create(data: AlbumCreate): AlbumRow {
    const result = this.db.prepare(
      'INSERT INTO albums (name, description) VALUES (?, ?)',
    ).run(data.name, data.description ?? null);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(id: number, data: AlbumUpdate): AlbumRow | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.cover_photo_id !== undefined) {
      fields.push('cover_photo_id = ?');
      values.push(data.cover_photo_id);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM albums WHERE id = ?').run(id);
  }

  getPhotos(albumId: number, limit: number, offset: number): { photos: PhotoRow[]; total: number } {
    const photos = this.db.prepare(`
      SELECT p.* FROM photos p
      JOIN album_photos ap ON ap.photo_id = p.id
      WHERE ap.album_id = ? AND p.deleted_at IS NULL
      ORDER BY ap.sort_order, ap.added_at DESC
      LIMIT ? OFFSET ?
    `).all(albumId, limit, offset) as PhotoRow[];

    const total = (this.db.prepare(`
      SELECT count(*) as count FROM album_photos ap
      JOIN photos p ON p.id = ap.photo_id
      WHERE ap.album_id = ? AND p.deleted_at IS NULL
    `).get(albumId) as { count: number }).count;

    return { photos, total };
  }

  addPhotos(albumId: number, photoIds: number[]): void {
    const maxOrder = (this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM album_photos WHERE album_id = ?',
    ).get(albumId) as { max_order: number }).max_order;

    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO album_photos (album_id, photo_id, sort_order) VALUES (?, ?, ?)',
    );

    const addMany = this.db.transaction((ids: number[]) => {
      let order = maxOrder + 1;
      for (const photoId of ids) {
        insert.run(albumId, photoId, order++);
      }
    });

    addMany(photoIds);

    // Auto-set cover if album has none
    const album = this.findById(albumId);
    if (album && !album.cover_photo_id && photoIds.length > 0) {
      this.update(albumId, { cover_photo_id: photoIds[0] });
    }
  }

  removePhotos(albumId: number, photoIds: number[]): void {
    const remove = this.db.prepare(
      'DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?',
    );

    const removeMany = this.db.transaction((ids: number[]) => {
      for (const photoId of ids) {
        remove.run(albumId, photoId);
      }
    });

    removeMany(photoIds);
  }

  reorderPhotos(albumId: number, photoIds: number[]): void {
    const update = this.db.prepare(
      'UPDATE album_photos SET sort_order = ? WHERE album_id = ? AND photo_id = ?',
    );

    const reorder = this.db.transaction((ids: number[]) => {
      for (let i = 0; i < ids.length; i++) {
        update.run(i, albumId, ids[i]);
      }
    });

    reorder(photoIds);
  }
}
