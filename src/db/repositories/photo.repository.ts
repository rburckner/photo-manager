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
