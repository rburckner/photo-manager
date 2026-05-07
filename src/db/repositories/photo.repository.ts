import type Database from 'better-sqlite3';
import type { PhotoInsert, PhotoRow } from '../../shared/types.js';

export class PhotoRepository {
  private readonly insertStmt: Database.Statement;
  private readonly findByPathStmt: Database.Statement;
  private readonly getDateModifiedStmt: Database.Statement;
  private readonly countStmt: Database.Statement;
  private readonly insertMany: Database.Transaction<(photos: PhotoInsert[]) => void>;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR REPLACE INTO photos (
        file_path, file_name, file_hash, file_size, mime_type,
        width, height, duration, date_taken, date_modified,
        camera_make, camera_model, lens, gps_lat, gps_lng,
        orientation, is_video, is_favorite, thumbnail_path, folder_path
      ) VALUES (
        @file_path, @file_name, @file_hash, @file_size, @mime_type,
        @width, @height, @duration, @date_taken, @date_modified,
        @camera_make, @camera_model, @lens, @gps_lat, @gps_lng,
        @orientation, @is_video, @is_favorite, @thumbnail_path, @folder_path
      )
    `);

    this.findByPathStmt = db.prepare('SELECT * FROM photos WHERE file_path = ?');
    this.getDateModifiedStmt = db.prepare('SELECT date_modified FROM photos WHERE file_path = ?');
    this.countStmt = db.prepare('SELECT count(*) as count FROM photos');

    this.insertMany = db.transaction((photos: PhotoInsert[]) => {
      for (const photo of photos) {
        this.insertStmt.run(photo);
      }
    });
  }

  batchInsert(photos: PhotoInsert[]): void {
    this.insertMany(photos);
  }

  findByFilePath(filePath: string): PhotoRow | undefined {
    return this.findByPathStmt.get(filePath) as PhotoRow | undefined;
  }

  getDateModified(filePath: string): string | undefined {
    const row = this.getDateModifiedStmt.get(filePath) as { date_modified: string } | undefined;
    return row?.date_modified;
  }

  countAll(): number {
    const row = this.countStmt.get() as { count: number };
    return row.count;
  }

  findByHash(hash: string): PhotoRow[] {
    return this.db.prepare('SELECT * FROM photos WHERE file_hash = ?').all(hash) as PhotoRow[];
  }

  findById(id: number): PhotoRow | undefined {
    return this.db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow | undefined;
  }

  private buildOrderBy(sort?: string, order?: string): string {
    const dir = order === 'asc' ? 'ASC' : 'DESC';
    switch (sort) {
      case 'name': return `ORDER BY file_name ${dir}`;
      case 'size': return `ORDER BY file_size ${dir}`;
      case 'camera': return `ORDER BY camera_model ${dir}, COALESCE(date_taken, date_modified) DESC`;
      case 'date':
      default: return `ORDER BY COALESCE(date_taken, date_modified) ${dir}`;
    }
  }

  list(opts: { limit: number; offset: number; folder?: string; sort?: string; order?: string }): { photos: PhotoRow[]; total: number } {
    const orderBy = this.buildOrderBy(opts.sort, opts.order);

    if (opts.folder) {
      const photos = this.db.prepare(
        `SELECT * FROM photos WHERE folder_path = ? AND is_hidden = 0 ${orderBy} LIMIT ? OFFSET ?`,
      ).all(opts.folder, opts.limit, opts.offset) as PhotoRow[];
      const total = (this.db.prepare(
        'SELECT count(*) as count FROM photos WHERE folder_path = ? AND is_hidden = 0',
      ).get(opts.folder) as { count: number }).count;
      return { photos, total };
    }

    const photos = this.db.prepare(
      `SELECT * FROM photos WHERE is_hidden = 0 ${orderBy} LIMIT ? OFFSET ?`,
    ).all(opts.limit, opts.offset) as PhotoRow[];
    const total = (this.db.prepare('SELECT count(*) as count FROM photos WHERE is_hidden = 0').get() as { count: number }).count;
    return { photos, total };
  }

  getTimeline(opts: { limit: number; offset: number; before?: string; after?: string }): PhotoRow[] {
    const conditions: string[] = ['is_hidden = 0'];
    const params: unknown[] = [];

    if (opts.before) {
      conditions.push('COALESCE(date_taken, date_modified) < ?');
      params.push(opts.before);
    }
    if (opts.after) {
      conditions.push('COALESCE(date_taken, date_modified) > ?');
      params.push(opts.after);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(opts.limit, opts.offset);

    return this.db.prepare(
      `SELECT * FROM photos ${where} ORDER BY COALESCE(date_taken, date_modified) DESC LIMIT ? OFFSET ?`,
    ).all(...params) as PhotoRow[];
  }

  getPhotosWithoutThumbnails(limit: number): Array<{ id: number; file_path: string; file_name: string; is_video: number }> {
    return this.db.prepare(`
      SELECT id, file_path, file_name, is_video FROM photos
      WHERE thumbnail_path IS NULL
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; file_path: string; file_name: string; is_video: number }>;
  }

  setThumbnailPath(id: number, thumbnailPath: string): void {
    this.db.prepare('UPDATE photos SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, id);
  }

  findSimilar(photoId: number): { sameDay: PhotoRow[]; samePerson: PhotoRow[] } {
    const photo = this.findById(photoId);
    if (!photo) return { sameDay: [], samePerson: [] };

    // Same day: all photos with same date (to the day)
    const date = photo.date_taken ?? photo.date_modified;
    const dayStart = date.slice(0, 10) + 'T00:00:00';
    const dayEnd = date.slice(0, 10) + 'T23:59:59';
    const sameDay = this.db.prepare(`
      SELECT * FROM photos
      WHERE id != ? AND is_hidden = 0
        AND COALESCE(date_taken, date_modified) BETWEEN ? AND ?
      ORDER BY COALESCE(date_taken, date_modified)
      LIMIT 500
    `).all(photoId, dayStart, dayEnd) as PhotoRow[];

    // Same person: if this photo has a face with a person_id, find other photos of that person
    const face = this.db.prepare(`
      SELECT person_id FROM faces WHERE photo_id = ? AND person_id IS NOT NULL LIMIT 1
    `).get(photoId) as { person_id: number } | undefined;

    let samePerson: PhotoRow[] = [];
    if (face) {
      const personPhotoIds = this.db.prepare(`
        SELECT DISTINCT f.photo_id FROM faces f
        JOIN photos p ON p.id = f.photo_id
        WHERE f.person_id = ? AND f.photo_id != ? AND p.is_hidden = 0
        ORDER BY p.date_taken DESC
        LIMIT 200
      `).all(face.person_id, photoId) as Array<{ photo_id: number }>;

      samePerson = personPhotoIds
        .map((r) => this.findById(r.photo_id))
        .filter((p): p is PhotoRow => p !== undefined);
    }

    return { sameDay, samePerson };
  }

  bulkSetHidden(ids: number[], hidden: boolean): void {
    const stmt = this.db.prepare('UPDATE photos SET is_hidden = ? WHERE id = ?');
    const run = this.db.transaction((photoIds: number[]) => {
      for (const id of photoIds) {
        stmt.run(hidden ? 1 : 0, id);
      }
    });
    run(ids);
  }

  getHiddenPhotos(limit: number, offset: number): { photos: PhotoRow[]; total: number } {
    const photos = this.db.prepare(
      'SELECT * FROM photos WHERE is_hidden = 1 ORDER BY COALESCE(date_taken, date_modified) DESC LIMIT ? OFFSET ?',
    ).all(limit, offset) as PhotoRow[];
    const total = (this.db.prepare(
      'SELECT count(*) as count FROM photos WHERE is_hidden = 1',
    ).get() as { count: number }).count;
    return { photos, total };
  }

  bulkSetDate(ids: number[], date: string): void {
    const stmt = this.db.prepare('UPDATE photos SET date_taken = ? WHERE id = ?');
    const run = this.db.transaction((photoIds: number[]) => {
      for (const id of photoIds) {
        stmt.run(date, id);
      }
    });
    run(ids);
  }

  getPhotosWithBadDates(limit: number): PhotoRow[] {
    return this.db.prepare(`
      SELECT * FROM photos
      WHERE date_taken IS NULL
         OR date_taken < '1990-01-01'
         OR date_taken > datetime('now', '+1 day')
      ORDER BY date_modified DESC
      LIMIT ?
    `).all(limit) as PhotoRow[];
  }

  bulkSetFavorite(ids: number[], value: boolean): void {
    const stmt = this.db.prepare('UPDATE photos SET is_favorite = ? WHERE id = ?');
    const run = this.db.transaction((photoIds: number[]) => {
      for (const id of photoIds) {
        stmt.run(value ? 1 : 0, id);
      }
    });
    run(ids);
  }

  toggleFavorite(id: number): boolean {
    const photo = this.findById(id);
    if (!photo) return false;
    const newValue = photo.is_favorite === 1 ? 0 : 1;
    this.db.prepare('UPDATE photos SET is_favorite = ? WHERE id = ?').run(newValue, id);
    return newValue === 1;
  }

  getFavorites(limit: number, offset: number): { photos: PhotoRow[]; total: number } {
    const photos = this.db.prepare(
      'SELECT * FROM photos WHERE is_favorite = 1 AND is_hidden = 0 ORDER BY COALESCE(date_taken, date_modified) DESC LIMIT ? OFFSET ?',
    ).all(limit, offset) as PhotoRow[];
    const total = (this.db.prepare(
      'SELECT count(*) as count FROM photos WHERE is_favorite = 1 AND is_hidden = 0',
    ).get() as { count: number }).count;
    return { photos, total };
  }

  removeFromIndex(id: number): void {
    const photo = this.findById(id);
    if (photo) {
      // Log for manual NAS cleanup
      this.db.prepare(
        'INSERT INTO cleanup_log (file_path, file_hash, reason) VALUES (?, ?, ?)',
      ).run(photo.file_path, photo.file_hash, 'duplicate');
    }
    this.db.prepare('DELETE FROM album_photos WHERE photo_id = ?').run(id);
    this.db.prepare('DELETE FROM photo_tags WHERE photo_id = ?').run(id);
    this.db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  }

  getCleanupLog(): Array<{ id: number; file_path: string; file_hash: string; reason: string; removed_at: string }> {
    return this.db.prepare(
      'SELECT * FROM cleanup_log ORDER BY removed_at DESC',
    ).all() as Array<{ id: number; file_path: string; file_hash: string; reason: string; removed_at: string }>;
  }

  clearCleanupEntry(id: number): void {
    this.db.prepare('DELETE FROM cleanup_log WHERE id = ?').run(id);
  }

  getDuplicates(): Array<{ file_hash: string; count: number; photos: Array<{ id: number; file_path: string; file_size: number; mime_type: string }> }> {
    const hashes = this.db.prepare(`
      SELECT file_hash, count(*) as count
      FROM photos
      GROUP BY file_hash
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 500
    `).all() as Array<{ file_hash: string; count: number }>;

    return hashes.map((h) => ({
      ...h,
      photos: this.db.prepare(
        'SELECT id, file_path, file_size, mime_type FROM photos WHERE file_hash = ?',
      ).all(h.file_hash) as Array<{ id: number; file_path: string; file_size: number; mime_type: string }>,
    }));
  }

  getStatsByYear(): Array<{ year: string; count: number }> {
    return this.db.prepare(`
      SELECT strftime('%Y', COALESCE(date_taken, date_modified)) as year, count(*) as count
      FROM photos
      WHERE COALESCE(date_taken, date_modified) > '1990-01-01'
      GROUP BY year
      ORDER BY year
    `).all() as Array<{ year: string; count: number }>;
  }

  getDistinctYears(): number[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT CAST(strftime('%Y', COALESCE(date_taken, date_modified)) AS INTEGER) as year
      FROM photos
      WHERE COALESCE(date_taken, date_modified) > '1990-01-01'
      ORDER BY year
    `).all() as Array<{ year: number }>;
    return rows.map((r) => r.year);
  }

  getStatsByCamera(): Array<{ camera: string; count: number }> {
    return this.db.prepare(`
      SELECT COALESCE(camera_model, 'Unknown') as camera, count(*) as count
      FROM photos
      GROUP BY camera
      ORDER BY count DESC
      LIMIT 20
    `).all() as Array<{ camera: string; count: number }>;
  }

  getStatsByType(): Array<{ mime_type: string; count: number; total_size: number }> {
    return this.db.prepare(`
      SELECT mime_type, count(*) as count, sum(file_size) as total_size
      FROM photos
      GROUP BY mime_type
      ORDER BY count DESC
    `).all() as Array<{ mime_type: string; count: number; total_size: number }>;
  }

  getSlideshow(opts: { limit: number; shuffle: boolean; albumId?: number }): Array<{ id: number; date_taken: string | null; gps_lat: number | null; gps_lng: number | null; folder_path: string; is_video: number }> {
    const order = opts.shuffle ? 'ORDER BY RANDOM()' : 'ORDER BY COALESCE(date_taken, date_modified) DESC';

    if (opts.albumId) {
      return this.db.prepare(`
        SELECT p.id, p.date_taken, p.gps_lat, p.gps_lng, p.folder_path, p.is_video
        FROM photos p
        JOIN album_photos ap ON ap.photo_id = p.id
        WHERE ap.album_id = ? AND p.is_video = 0
        ${order} LIMIT ?
      `).all(opts.albumId, opts.limit) as Array<{ id: number; date_taken: string | null; gps_lat: number | null; gps_lng: number | null; folder_path: string; is_video: number }>;
    }

    return this.db.prepare(`
      SELECT id, date_taken, gps_lat, gps_lng, folder_path, is_video
      FROM photos
      WHERE is_video = 0
      ${order} LIMIT ?
    `).all(opts.limit) as Array<{ id: number; date_taken: string | null; gps_lat: number | null; gps_lng: number | null; folder_path: string; is_video: number }>;
  }

  getMapPoints(limit: number): Array<{ id: number; gps_lat: number; gps_lng: number; date_taken: string | null; thumbnail_path: string | null; is_video: number }> {
    return this.db.prepare(`
      SELECT id, gps_lat, gps_lng, date_taken, thumbnail_path, is_video
      FROM photos
      WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL
      ORDER BY date_taken DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; gps_lat: number; gps_lng: number; date_taken: string | null; thumbnail_path: string | null; is_video: number }>;
  }

  search(query: string, limit: number, offset: number): { photos: PhotoRow[]; total: number } {
    const pattern = `%${query}%`;
    const photos = this.db.prepare(`
      SELECT * FROM photos
      WHERE is_hidden = 0 AND (file_name LIKE ? OR folder_path LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?)
      ORDER BY COALESCE(date_taken, date_modified) DESC
      LIMIT ? OFFSET ?
    `).all(pattern, pattern, pattern, pattern, limit, offset) as PhotoRow[];

    const total = (this.db.prepare(`
      SELECT count(*) as count FROM photos
      WHERE is_hidden = 0 AND (file_name LIKE ? OR folder_path LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?)
    `).get(pattern, pattern, pattern, pattern) as { count: number }).count;

    return { photos, total };
  }

  getFolders(): Array<{ folder_path: string; count: number }> {
    return this.db.prepare(
      'SELECT folder_path, count(*) as count FROM photos GROUP BY folder_path ORDER BY folder_path',
    ).all() as Array<{ folder_path: string; count: number }>;
  }

  getStats(): { total: number; images: number; videos: number; totalSize: number; earliestDate: string | null; latestDate: string | null } {
    const row = this.db.prepare(`
      SELECT
        count(*) as total,
        sum(CASE WHEN is_video = 0 THEN 1 ELSE 0 END) as images,
        sum(CASE WHEN is_video = 1 THEN 1 ELSE 0 END) as videos,
        sum(file_size) as totalSize,
        min(date_taken) as earliestDate,
        max(date_taken) as latestDate
      FROM photos
    `).get() as { total: number; images: number; videos: number; totalSize: number; earliestDate: string | null; latestDate: string | null };
    return row;
  }
}
