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

  list(opts: { limit: number; offset: number; folder?: string }): { photos: PhotoRow[]; total: number } {
    if (opts.folder) {
      const photos = this.db.prepare(
        'SELECT * FROM photos WHERE folder_path = ? ORDER BY date_taken DESC, date_modified DESC LIMIT ? OFFSET ?',
      ).all(opts.folder, opts.limit, opts.offset) as PhotoRow[];
      const total = (this.db.prepare(
        'SELECT count(*) as count FROM photos WHERE folder_path = ?',
      ).get(opts.folder) as { count: number }).count;
      return { photos, total };
    }

    const photos = this.db.prepare(
      'SELECT * FROM photos ORDER BY date_taken DESC, date_modified DESC LIMIT ? OFFSET ?',
    ).all(opts.limit, opts.offset) as PhotoRow[];
    const total = this.countAll();
    return { photos, total };
  }

  getTimeline(opts: { limit: number; offset: number; before?: string; after?: string }): PhotoRow[] {
    const conditions: string[] = [];
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

  toggleFavorite(id: number): boolean {
    const photo = this.findById(id);
    if (!photo) return false;
    const newValue = photo.is_favorite === 1 ? 0 : 1;
    this.db.prepare('UPDATE photos SET is_favorite = ? WHERE id = ?').run(newValue, id);
    return newValue === 1;
  }

  getFavorites(limit: number, offset: number): { photos: PhotoRow[]; total: number } {
    const photos = this.db.prepare(
      'SELECT * FROM photos WHERE is_favorite = 1 ORDER BY COALESCE(date_taken, date_modified) DESC LIMIT ? OFFSET ?',
    ).all(limit, offset) as PhotoRow[];
    const total = (this.db.prepare(
      'SELECT count(*) as count FROM photos WHERE is_favorite = 1',
    ).get() as { count: number }).count;
    return { photos, total };
  }

  getStatsByYear(): Array<{ year: string; count: number }> {
    return this.db.prepare(`
      SELECT strftime('%Y', COALESCE(date_taken, date_modified)) as year, count(*) as count
      FROM photos
      GROUP BY year
      ORDER BY year
    `).all() as Array<{ year: string; count: number }>;
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
      WHERE file_name LIKE ? OR folder_path LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?
      ORDER BY COALESCE(date_taken, date_modified) DESC
      LIMIT ? OFFSET ?
    `).all(pattern, pattern, pattern, pattern, limit, offset) as PhotoRow[];

    const total = (this.db.prepare(`
      SELECT count(*) as count FROM photos
      WHERE file_name LIKE ? OR folder_path LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?
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
