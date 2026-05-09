import type Database from 'better-sqlite3';
import type { PhotoInsert, PhotoRow } from '../../shared/types.js';

export class PhotoRepository {
  private readonly insertStmt: Database.Statement;
  private readonly findByPathStmt: Database.Statement;
  private readonly getDateModifiedStmt: Database.Statement;
  private readonly countStmt: Database.Statement;
  private readonly getShowHiddenStmt: Database.Statement;
  private readonly insertMany: Database.Transaction<(photos: PhotoInsert[]) => void>;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR REPLACE INTO photos (
        file_path, file_name, file_hash, file_size, mime_type,
        width, height, duration, date_taken, date_modified,
        camera_make, camera_model, lens, gps_lat, gps_lng,
        orientation, is_video, is_favorite, thumbnail_path, folder_path,
        perceptual_hash
      ) VALUES (
        @file_path, @file_name, @file_hash, @file_size, @mime_type,
        @width, @height, @duration, @date_taken, @date_modified,
        @camera_make, @camera_model, @lens, @gps_lat, @gps_lng,
        @orientation, @is_video, @is_favorite, @thumbnail_path, @folder_path,
        @perceptual_hash
      )
    `);

    this.findByPathStmt = db.prepare('SELECT * FROM photos WHERE file_path = ?');
    this.getDateModifiedStmt = db.prepare('SELECT date_modified FROM photos WHERE file_path = ?');
    this.countStmt = db.prepare('SELECT count(*) as count FROM photos WHERE deleted_at IS NULL');
    this.getShowHiddenStmt = db.prepare("SELECT value FROM app_settings WHERE key = 'show_hidden'");

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

  /**
   * SQL fragment that excludes photos hidden either per-photo (is_hidden=1)
   * or via a face belonging to a hidden person (people.status='hidden').
   *
   * Returns an empty string when the `show_hidden` app setting is '1' so
   * the override exposes everything. Callers must prepend ' AND ' when
   * appending to an existing WHERE clause; the helper does NOT include it.
   *
   * Underscore aliases (_hf, _hp) avoid collisions with caller table aliases.
   */
  private hiddenFilterSql(alias = 'photos'): string {
    const row = this.getShowHiddenStmt.get() as { value: string } | undefined;
    if (row?.value === 'true') return '';
    return `${alias}.is_hidden = 0 AND NOT EXISTS (
      SELECT 1 FROM faces _hf
      JOIN people _hp ON _hp.id = _hf.person_id
      WHERE _hf.photo_id = ${alias}.id AND _hp.status = 'hidden'
    )`;
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

  list(opts: { limit: number; offset: number; folder?: string; sort?: string; order?: string; fromDate?: string; toDate?: string }): { photos: PhotoRow[]; total: number } {
    const orderBy = this.buildOrderBy(opts.sort, opts.order);
    const hf = this.hiddenFilterSql();
    const hfClause = hf ? `AND ${hf}` : '';

    // Optional date range — only used by DLNA's "All Photos" container today.
    const dateClauseParts: string[] = [];
    const dateParams: unknown[] = [];
    if (opts.fromDate) {
      dateClauseParts.push("AND COALESCE(date_taken, date_modified) >= ?");
      dateParams.push(opts.fromDate);
    }
    if (opts.toDate) {
      dateClauseParts.push("AND COALESCE(date_taken, date_modified) <= ?");
      dateParams.push(opts.toDate);
    }
    const dateClause = dateClauseParts.join(' ');

    if (opts.folder) {
      const photos = this.db.prepare(
        `SELECT * FROM photos WHERE folder_path = ? AND deleted_at IS NULL ${hfClause} ${dateClause} ${orderBy} LIMIT ? OFFSET ?`,
      ).all(opts.folder, ...dateParams, opts.limit, opts.offset) as PhotoRow[];
      const total = (this.db.prepare(
        `SELECT count(*) as count FROM photos WHERE folder_path = ? AND deleted_at IS NULL ${hfClause} ${dateClause}`,
      ).get(opts.folder, ...dateParams) as { count: number }).count;
      return { photos, total };
    }

    const photos = this.db.prepare(
      `SELECT * FROM photos WHERE deleted_at IS NULL ${hfClause} ${dateClause} ${orderBy} LIMIT ? OFFSET ?`,
    ).all(...dateParams, opts.limit, opts.offset) as PhotoRow[];
    const total = (this.db.prepare(`SELECT count(*) as count FROM photos WHERE deleted_at IS NULL ${hfClause} ${dateClause}`).get(...dateParams) as { count: number }).count;
    return { photos, total };
  }

  getTimeline(opts: { limit: number; offset: number; before?: string; after?: string; sort?: string; order?: string }): PhotoRow[] {
    const conditions: string[] = ['deleted_at IS NULL'];
    const hf = this.hiddenFilterSql();
    if (hf) conditions.push(hf);
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
    const orderBy = this.buildOrderBy(opts.sort, opts.order);
    params.push(opts.limit, opts.offset);

    return this.db.prepare(
      `SELECT * FROM photos ${where} ${orderBy} LIMIT ? OFFSET ?`,
    ).all(...params) as PhotoRow[];
  }

  getPhotosWithoutGps(limit: number): Array<{ id: number; file_path: string }> {
    return this.db.prepare(`
      SELECT id, file_path FROM photos
      WHERE gps_lat IS NULL AND is_video = 0 AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; file_path: string }>;
  }

  updateGps(id: number, lat: number, lng: number): void {
    this.db.prepare('UPDATE photos SET gps_lat = ?, gps_lng = ? WHERE id = ?').run(lat, lng, id);
  }

  getPhotosWithoutThumbnails(limit: number): Array<{ id: number; file_path: string; file_name: string; is_video: number }> {
    return this.db.prepare(`
      SELECT id, file_path, file_name, is_video FROM photos
      WHERE thumbnail_path IS NULL AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; file_path: string; file_name: string; is_video: number }>;
  }

  setThumbnailPath(id: number, thumbnailPath: string): void {
    this.db.prepare('UPDATE photos SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, id);
  }

  getPhotosWithoutPerceptualHash(limit: number): Array<{ id: number; file_path: string }> {
    return this.db.prepare(`
      SELECT id, file_path FROM photos
      WHERE perceptual_hash IS NULL
        AND is_video = 0
        AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; file_path: string }>;
  }

  setPerceptualHash(id: number, hash: string): void {
    this.db.prepare('UPDATE photos SET perceptual_hash = ? WHERE id = ?').run(hash, id);
  }

  getAllPerceptualHashes(): Array<{ id: number; perceptual_hash: string }> {
    return this.db.prepare(`
      SELECT id, perceptual_hash FROM photos
      WHERE perceptual_hash IS NOT NULL
        AND deleted_at IS NULL
        AND is_video = 0
    `).all() as Array<{ id: number; perceptual_hash: string }>;
  }

  findSimilar(photoId: number): { sameDay: PhotoRow[]; samePerson: PhotoRow[] } {
    const photo = this.findById(photoId);
    if (!photo) return { sameDay: [], samePerson: [] };

    // Same day: all photos with same date (to the day)
    const date = photo.date_taken ?? photo.date_modified;
    const dayStart = date.slice(0, 10) + 'T00:00:00';
    const dayEnd = date.slice(0, 10) + 'T23:59:59';
    const hf = this.hiddenFilterSql();
    const hfClause = hf ? `AND ${hf}` : '';
    const sameDay = this.db.prepare(`
      SELECT * FROM photos
      WHERE id != ? AND deleted_at IS NULL ${hfClause}
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
      const hfPerson = this.hiddenFilterSql('p');
      const hfPersonClause = hfPerson ? `AND ${hfPerson}` : '';
      const personPhotoIds = this.db.prepare(`
        SELECT DISTINCT f.photo_id FROM faces f
        JOIN photos p ON p.id = f.photo_id
        WHERE f.person_id = ? AND f.photo_id != ? AND p.deleted_at IS NULL ${hfPersonClause}
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
      'SELECT * FROM photos WHERE is_hidden = 1 AND deleted_at IS NULL ORDER BY COALESCE(date_taken, date_modified) DESC LIMIT ? OFFSET ?',
    ).all(limit, offset) as PhotoRow[];
    const total = (this.db.prepare(
      'SELECT count(*) as count FROM photos WHERE is_hidden = 1 AND deleted_at IS NULL',
    ).get() as { count: number }).count;
    return { photos, total };
  }

  /**
   * All non-trashed images (videos excluded — extractExif handles still images
   * only). Used by the manual "Re-scan dates" job to refresh date_taken from
   * EXIF.
   */
  getAllImagePhotos(limit: number): Array<{ id: number; file_path: string }> {
    return this.db.prepare(`
      SELECT id, file_path FROM photos
      WHERE is_video = 0 AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; file_path: string }>;
  }

  updateDateTaken(id: number, dateIso: string): void {
    this.db.prepare('UPDATE photos SET date_taken = ? WHERE id = ?').run(dateIso, id);
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
      WHERE deleted_at IS NULL AND (date_taken IS NULL
         OR date_taken < '1990-01-01'
         OR date_taken > datetime('now', '+1 day'))
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
    const hf = this.hiddenFilterSql();
    const hfClause = hf ? `AND ${hf}` : '';
    const photos = this.db.prepare(
      `SELECT * FROM photos WHERE is_favorite = 1 AND deleted_at IS NULL ${hfClause} ORDER BY COALESCE(date_taken, date_modified) DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset) as PhotoRow[];
    const total = (this.db.prepare(
      `SELECT count(*) as count FROM photos WHERE is_favorite = 1 AND deleted_at IS NULL ${hfClause}`,
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
      WHERE deleted_at IS NULL
      GROUP BY file_hash
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 500
    `).all() as Array<{ file_hash: string; count: number }>;

    return hashes.map((h) => ({
      ...h,
      photos: this.db.prepare(
        'SELECT id, file_path, file_size, mime_type FROM photos WHERE file_hash = ? AND deleted_at IS NULL',
      ).all(h.file_hash) as Array<{ id: number; file_path: string; file_size: number; mime_type: string }>,
    }));
  }

  getStatsByYear(): Array<{ year: string; count: number }> {
    return this.db.prepare(`
      SELECT strftime('%Y', COALESCE(date_taken, date_modified)) as year, count(*) as count
      FROM photos
      WHERE COALESCE(date_taken, date_modified) > '1990-01-01' AND deleted_at IS NULL
      GROUP BY year
      ORDER BY year
    `).all() as Array<{ year: string; count: number }>;
  }

  getDistinctYears(): number[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT CAST(strftime('%Y', COALESCE(date_taken, date_modified)) AS INTEGER) as year
      FROM photos
      WHERE COALESCE(date_taken, date_modified) > '1990-01-01' AND deleted_at IS NULL
      ORDER BY year
    `).all() as Array<{ year: number }>;
    return rows.map((r) => r.year);
  }

  getStatsByCamera(): Array<{ camera: string; count: number }> {
    return this.db.prepare(`
      SELECT COALESCE(camera_model, 'Unknown') as camera, count(*) as count
      FROM photos
      WHERE deleted_at IS NULL
      GROUP BY camera
      ORDER BY count DESC
      LIMIT 20
    `).all() as Array<{ camera: string; count: number }>;
  }

  getStatsByType(): Array<{ mime_type: string; count: number; total_size: number }> {
    return this.db.prepare(`
      SELECT mime_type, count(*) as count, sum(file_size) as total_size
      FROM photos
      WHERE deleted_at IS NULL
      GROUP BY mime_type
      ORDER BY count DESC
    `).all() as Array<{ mime_type: string; count: number; total_size: number }>;
  }

  getSlideshow(opts: { limit: number; shuffle: boolean; albumId?: number; fromDate?: string; toDate?: string }): Array<{ id: number; date_taken: string | null; gps_lat: number | null; gps_lng: number | null; folder_path: string; is_video: number }> {
    const order = opts.shuffle ? 'ORDER BY RANDOM()' : 'ORDER BY COALESCE(date_taken, date_modified) DESC';
    const hfP = this.hiddenFilterSql('p');
    const hfPClause = hfP ? `AND ${hfP}` : '';

    if (opts.albumId) {
      return this.db.prepare(`
        SELECT p.id, p.date_taken, p.gps_lat, p.gps_lng, p.folder_path, p.is_video
        FROM photos p
        JOIN album_photos ap ON ap.photo_id = p.id
        WHERE ap.album_id = ? AND p.is_video = 0 AND p.deleted_at IS NULL ${hfPClause}
        ${order} LIMIT ?
      `).all(opts.albumId, opts.limit) as Array<{ id: number; date_taken: string | null; gps_lat: number | null; gps_lng: number | null; folder_path: string; is_video: number }>;
    }

    // Optional date range. Both bounds inclusive; the YYYY-MM input from the
    // settings UI is widened to month start / next-month start respectively.
    const hf = this.hiddenFilterSql();
    const conditions: string[] = ['is_video = 0', 'deleted_at IS NULL'];
    if (hf) conditions.push(hf);
    const params: unknown[] = [];
    if (opts.fromDate) {
      conditions.push("COALESCE(date_taken, date_modified) >= ?");
      params.push(opts.fromDate);
    }
    if (opts.toDate) {
      conditions.push("COALESCE(date_taken, date_modified) <= ?");
      params.push(opts.toDate);
    }
    params.push(opts.limit);

    return this.db.prepare(`
      SELECT id, date_taken, gps_lat, gps_lng, folder_path, is_video
      FROM photos
      WHERE ${conditions.join(' AND ')}
      ${order} LIMIT ?
    `).all(...params) as Array<{ id: number; date_taken: string | null; gps_lat: number | null; gps_lng: number | null; folder_path: string; is_video: number }>;
  }

  getMapPoints(limit: number): Array<{ id: number; gps_lat: number; gps_lng: number; date_taken: string | null; thumbnail_path: string | null; is_video: number }> {
    const hf = this.hiddenFilterSql();
    const hfClause = hf ? `AND ${hf}` : '';
    return this.db.prepare(`
      SELECT id, gps_lat, gps_lng, date_taken, thumbnail_path, is_video
      FROM photos
      WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL AND deleted_at IS NULL ${hfClause}
      ORDER BY date_taken DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number; gps_lat: number; gps_lng: number; date_taken: string | null; thumbnail_path: string | null; is_video: number }>;
  }

  search(query: string, limit: number, offset: number): { photos: PhotoRow[]; total: number } {
    const pattern = `%${query}%`;
    const hf = this.hiddenFilterSql();
    const hfClause = hf ? `AND ${hf}` : '';
    const photos = this.db.prepare(`
      SELECT * FROM photos
      WHERE deleted_at IS NULL ${hfClause} AND (file_name LIKE ? OR folder_path LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?)
      ORDER BY COALESCE(date_taken, date_modified) DESC
      LIMIT ? OFFSET ?
    `).all(pattern, pattern, pattern, pattern, limit, offset) as PhotoRow[];

    const total = (this.db.prepare(`
      SELECT count(*) as count FROM photos
      WHERE deleted_at IS NULL ${hfClause} AND (file_name LIKE ? OR folder_path LIKE ? OR camera_make LIKE ? OR camera_model LIKE ?)
    `).get(pattern, pattern, pattern, pattern) as { count: number }).count;

    return { photos, total };
  }

  getFolders(): Array<{ folder_path: string; count: number }> {
    return this.db.prepare(
      'SELECT folder_path, count(*) as count FROM photos WHERE deleted_at IS NULL GROUP BY folder_path ORDER BY folder_path',
    ).all() as Array<{ folder_path: string; count: number }>;
  }

  getStats(): { total: number; images: number; videos: number; totalSize: number; earliestDate: string | null; latestDate: string | null } {
    const hf = this.hiddenFilterSql();
    const hfClause = hf ? `AND ${hf}` : '';
    const row = this.db.prepare(`
      SELECT
        count(*) as total,
        sum(CASE WHEN is_video = 0 THEN 1 ELSE 0 END) as images,
        sum(CASE WHEN is_video = 1 THEN 1 ELSE 0 END) as videos,
        sum(file_size) as totalSize,
        min(CASE WHEN COALESCE(date_taken, date_modified) > '1990-01-01' THEN COALESCE(date_taken, date_modified) END) as earliestDate,
        max(CASE WHEN COALESCE(date_taken, date_modified) <= datetime('now', '+1 day') THEN COALESCE(date_taken, date_modified) END) as latestDate
      FROM photos
      WHERE deleted_at IS NULL ${hfClause}
    `).get() as { total: number; images: number; videos: number; totalSize: number; earliestDate: string | null; latestDate: string | null };
    return row;
  }

  // ── Trash methods ──

  /**
   * Soft-delete: marks a photo as trashed.
   * The actual filesystem rename is the route's responsibility (so a failed rename can roll back the DB).
   *
   * `reason` distinguishes user-initiated deletes (default — subject to the
   * 30-day auto-purge cron) from system-staged categories like
   * 'jpg-redundant' (move-redundant-jpgs CLI — never auto-purged).
   */
  markTrashed(id: number, trashRelativePath: string, reason: 'user' | 'jpg-redundant' = 'user'): void {
    const photo = this.findById(id);
    if (!photo) return;
    this.db.prepare(`
      UPDATE photos
      SET deleted_at = datetime('now'),
          original_path = ?,
          trash_path = ?,
          file_path = ?,
          trash_reason = ?
      WHERE id = ?
    `).run(photo.file_path, trashRelativePath, trashRelativePath, reason, id);
  }

  /**
   * Restore: clears the trashed state. Caller is responsible for the filesystem rename.
   */
  markRestored(id: number): void {
    const photo = this.findById(id);
    if (!photo?.original_path) return;
    this.db.prepare(`
      UPDATE photos
      SET deleted_at = NULL,
          trash_path = NULL,
          original_path = NULL,
          trash_reason = NULL,
          file_path = ?
      WHERE id = ?
    `).run(photo.original_path, id);
  }

  /**
   * Permanent delete: removes the DB row and all references. Caller handles file unlink.
   */
  purgeRow(id: number): void {
    this.db.prepare('DELETE FROM album_photos WHERE photo_id = ?').run(id);
    this.db.prepare('DELETE FROM photo_tags WHERE photo_id = ?').run(id);
    this.db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  }

  /**
   * User-facing trash list. Excludes system-staged categories like
   * 'jpg-redundant' so the /trash UI isn't polluted with thousands of
   * staged JPGs awaiting manual filesystem deletion.
   *
   * NULL trash_reason is treated as 'user' for backwards compat with rows
   * trashed before migration 014 added the column.
   */
  getTrashed(opts: { limit: number; offset: number }): { photos: PhotoRow[]; total: number } {
    const photos = this.db.prepare(
      `SELECT * FROM photos WHERE deleted_at IS NOT NULL
        AND (trash_reason IS NULL OR trash_reason = 'user')
        ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
    ).all(opts.limit, opts.offset) as PhotoRow[];
    const total = (this.db.prepare(
      `SELECT count(*) as count FROM photos WHERE deleted_at IS NOT NULL
        AND (trash_reason IS NULL OR trash_reason = 'user')`,
    ).get() as { count: number }).count;
    return { photos, total };
  }

  getAllTrashed(): PhotoRow[] {
    return this.db.prepare(
      `SELECT * FROM photos WHERE deleted_at IS NOT NULL
        AND (trash_reason IS NULL OR trash_reason = 'user')
        ORDER BY deleted_at DESC`,
    ).all() as PhotoRow[];
  }

  /**
   * Used by the daily auto-purge cron. Scoped to user-trash only — staged
   * JPGs (trash_reason='jpg-redundant') are never auto-deleted; they wait
   * for explicit manual filesystem rm + prune-missing CLI.
   */
  getExpiredTrash(olderThanDays: number): PhotoRow[] {
    return this.db.prepare(`
      SELECT * FROM photos
      WHERE deleted_at IS NOT NULL
        AND (trash_reason IS NULL OR trash_reason = 'user')
        AND deleted_at < datetime('now', ?)
    `).all(`-${olderThanDays} days`) as PhotoRow[];
  }

  getTrashStats(): { count: number; totalSize: number } {
    const row = this.db.prepare(`
      SELECT count(*) as count, COALESCE(sum(file_size), 0) as totalSize
      FROM photos
      WHERE deleted_at IS NOT NULL
        AND (trash_reason IS NULL OR trash_reason = 'user')
    `).get() as { count: number; totalSize: number };
    return row;
  }

  // ── Redundant-JPG identification + DB-prune support ──

  /**
   * JPGs whose basename + folder matches a HEIC/HEIF in the same directory.
   * Both must currently be live (not trashed). Used by the
   * find-redundant-jpgs CLI command.
   */
  findRedundantJpgs(): Array<{
    jpg_id: number; jpg_path: string; jpg_size: number; jpg_mtime: string;
    heic_id: number; heic_path: string; heic_size: number; heic_mtime: string;
  }> {
    return this.db.prepare(`
      SELECT
        j.id           AS jpg_id,
        j.file_path    AS jpg_path,
        j.file_size    AS jpg_size,
        j.date_modified AS jpg_mtime,
        h.id           AS heic_id,
        h.file_path    AS heic_path,
        h.file_size    AS heic_size,
        h.date_modified AS heic_mtime
      FROM photos j
      JOIN photos h
        ON j.folder_path = h.folder_path
        AND lower(j.file_name) = lower(h.file_name)
      WHERE j.mime_type = 'image/jpeg'
        AND h.mime_type IN ('image/heic', 'image/heif')
        AND j.deleted_at IS NULL
        AND h.deleted_at IS NULL
        AND j.id != h.id
      ORDER BY j.file_path
    `).all() as Array<{
      jpg_id: number; jpg_path: string; jpg_size: number; jpg_mtime: string;
      heic_id: number; heic_path: string; heic_size: number; heic_mtime: string;
    }>;
  }

  /**
   * Find a trashed photo by its current file_path (= trash_path). Used by
   * the prune-missing CLI to look up a row given a relative path.
   */
  findByCurrentPath(relPath: string): PhotoRow | undefined {
    return this.db.prepare(
      'SELECT * FROM photos WHERE file_path = ?',
    ).get(relPath) as PhotoRow | undefined;
  }
}
