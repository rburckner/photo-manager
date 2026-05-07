import { FastifyInstance } from 'fastify';
import { join, extname } from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { copyFileSync } from 'node:fs';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import type { AppConfig } from '../../shared/types.js';
import { logActivity } from './auth.js';

interface TimelineGroup {
  date: string;
  count: number;
  photos: PhotoSummary[];
}

interface PhotoSummary {
  id: number;
  file_name: string;
  file_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  date_taken: string | null;
  is_video: number;
  thumbnail_path: string | null;
}

export async function photoRoutes(
  app: FastifyInstance,
  opts: { photoRepo: PhotoRepository; config: AppConfig; db: import('better-sqlite3').Database },
): Promise<void> {
  const { photoRepo, config, db } = opts;

  // GET /api/photos — paginated list with sort
  app.get<{
    Querystring: { page?: string; limit?: string; folder?: string; sort?: string; order?: string };
  }>('/api/photos', async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
    const offset = (page - 1) * limit;
    const folder = request.query.folder;

    const sort = request.query.sort;
    const order = request.query.order;
    const { photos, total } = photoRepo.list({ limit, offset, folder, sort, order });

    return {
      photos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /api/photos/timeline — grouped by date for timeline view
  app.get<{
    Querystring: { page?: string; limit?: string; before?: string; after?: string };
  }>('/api/photos/timeline', async (request) => {
    const limit = Math.min(500, Math.max(1, parseInt(request.query.limit ?? '100', 10)));
    const offset = Math.max(0, parseInt(request.query.page ?? '0', 10)) * limit;
    const before = request.query.before;
    const after = request.query.after;

    const photos = photoRepo.getTimeline({ limit, offset, before, after });

    // Group by date
    const groups = new Map<string, TimelineGroup>();
    for (const photo of photos) {
      const date = photo.date_taken?.slice(0, 10) ?? photo.date_modified.slice(0, 10);
      let group = groups.get(date);
      if (!group) {
        group = { date, count: 0, photos: [] };
        groups.set(date, group);
      }
      group.count++;
      group.photos.push({
        id: photo.id,
        file_name: photo.file_name,
        file_path: photo.file_path,
        mime_type: photo.mime_type,
        width: photo.width,
        height: photo.height,
        date_taken: photo.date_taken,
        is_video: photo.is_video,
        thumbnail_path: photo.thumbnail_path,
      });
    }

    return {
      groups: [...groups.values()],
      hasMore: photos.length === limit,
    };
  });

  // GET /api/photos/:id — single photo details
  app.get<{ Params: { id: string } }>('/api/photos/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);

    if (!photo) {
      return reply.code(404).send({ error: 'Photo not found' });
    }

    return photo;
  });

  // GET /api/photos/:id/thumbnail — serve thumbnail image, fall back to original
  app.get<{ Params: { id: string } }>('/api/photos/:id/thumbnail', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);

    if (!photo) {
      return reply.code(404).send({ error: 'Photo not found' });
    }

    // Try thumbnail first
    if (photo.thumbnail_path) {
      const thumbPath = join(config.thumbnailDir, photo.thumbnail_path);
      if (existsSync(thumbPath)) {
        return reply
          .type('image/jpeg')
          .header('Cache-Control', 'public, max-age=86400, immutable')
          .send(createReadStream(thumbPath));
      }
    }

    // Fall back to original file from NAS
    const filePath = join(config.mediaRoot, photo.file_path);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    return reply
      .type(photo.mime_type)
      .header('Cache-Control', 'public, max-age=86400')
      .send(createReadStream(filePath));
  });

  // GET /api/photos/:id/file — serve original file from NAS
  app.get<{ Params: { id: string } }>('/api/photos/:id/file', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);

    if (!photo) {
      return reply.code(404).send({ error: 'Photo not found' });
    }

    const filePath = join(config.mediaRoot, photo.file_path);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found on disk' });
    }

    return reply
      .type(photo.mime_type)
      .header('Cache-Control', 'public, max-age=604800, immutable')
      .send(createReadStream(filePath));
  });

  // GET /api/photos/folders — list folder tree
  app.get('/api/photos/folders', async () => {
    return photoRepo.getFolders();
  });

  // GET /api/cleanup — files removed from index, pending manual NAS cleanup
  app.get('/api/cleanup', async () => {
    return photoRepo.getCleanupLog();
  });

  // DELETE /api/cleanup/:id — mark a cleanup entry as done
  app.delete<{ Params: { id: string } }>('/api/cleanup/:id', async (request) => {
    photoRepo.clearCleanupEntry(parseInt(request.params.id, 10));
    return { ok: true };
  });

  // POST /api/photos/export — generate zip of selected photos
  app.post<{ Body: { photo_ids: number[] } }>('/api/photos/export', async (request, reply) => {
    const { photo_ids } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return reply.code(400).send({ error: 'photo_ids array is required' });
    }

    const archiver = await import('archiver');
    const archive = archiver.default('zip', { zlib: { level: 1 } }); // Fast compression

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="photos-export-${Date.now()}.zip"`);

    // Pipe archive to response
    void reply.send(archive);

    for (const id of photo_ids) {
      const photo = photoRepo.findById(id);
      if (!photo) continue;

      const filePath = join(config.mediaRoot, photo.file_path);
      if (existsSync(filePath)) {
        // Use the last segment of folder_path + filename for zip structure
        const zipPath = photo.folder_path
          ? `${photo.folder_path.split('/').pop()}/${photo.file_name}${extname(photo.file_path)}`
          : `${photo.file_name}${extname(photo.file_path)}`;
        archive.file(filePath, { name: zipPath });
      }
    }

    await archive.finalize();
  });

  // DELETE /api/photos/:id — remove from index only (NAS files untouched)
  app.delete<{ Params: { id: string } }>('/api/photos/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);
    if (!photo) {
      return reply.code(404).send({ error: 'Photo not found' });
    }
    photoRepo.removeFromIndex(id);
    logActivity(db, 'photo_removed_from_index', photo.file_path);
    return { ok: true, removed_path: photo.file_path };
  });

  // POST /api/ingest — manually trigger inbox processing
  app.post('/api/ingest', async () => {
    const { processInbox } = await import('../../ingestion/index.js');
    const results = await processInbox(config.dropboxDir, config.mediaRoot, photoRepo);
    return {
      imported: results.filter((r) => r.action === 'imported').length,
      duplicates: results.filter((r) => r.action === 'duplicate').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      errors: results.filter((r) => r.action === 'error').length,
      results,
    };
  });

  // Thumbnail generation state
  let thumbScanRunning = false;
  let thumbScanCancelled = false;
  let thumbScanProgress = { checked: 0, generated: 0, total: 0 };

  // POST /api/photos/generate-thumbnails — start thumbnail backfill (non-blocking)
  app.post('/api/photos/generate-thumbnails', async () => {
    if (thumbScanRunning) return { ok: true, message: 'Already running' };

    thumbScanRunning = true;
    thumbScanCancelled = false;
    thumbScanProgress = { checked: 0, generated: 0, total: 0 };

    void (async () => {
      const { generateThumbnail } = await import('../../scanner/thumbnails.js');
      const allMissing = photoRepo.getPhotosWithoutThumbnails(999999);
      thumbScanProgress.total = allMissing.length;

      for (const photo of allMissing) {
        if (thumbScanCancelled) break;

        const filePath = join(config.mediaRoot, photo.file_path);
        if (existsSync(filePath)) {
          const thumbPath = await generateThumbnail(filePath, photo.file_name, photo.is_video === 1, {
            size: 400, quality: 80, outputDir: config.thumbnailDir,
          });
          if (thumbPath) {
            photoRepo.setThumbnailPath(photo.id, thumbPath);
            thumbScanProgress.generated++;
          }
        }
        thumbScanProgress.checked++;

        if (thumbScanProgress.checked % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      thumbScanRunning = false;
    })();

    return { ok: true, message: 'Thumbnail generation started' };
  });

  // GET /api/photos/generate-thumbnails/status
  app.get('/api/photos/generate-thumbnails/status', async () => {
    return { running: thumbScanRunning, ...thumbScanProgress };
  });

  // POST /api/photos/generate-thumbnails/cancel
  app.post('/api/photos/generate-thumbnails/cancel', async () => {
    thumbScanCancelled = true;
    return { ok: true };
  });

  // GET /api/photos/duplicates — files with same hash in different paths
  app.get('/api/photos/duplicates', async () => {
    return photoRepo.getDuplicates();
  });

  // GPS re-scan state
  let gpsScanRunning = false;
  let gpsScanCancelled = false;
  let gpsScanProgress = { checked: 0, found: 0, total: 0 };

  // POST /api/photos/rescan-gps — start GPS re-scan (non-blocking)
  app.post('/api/photos/rescan-gps', async () => {
    if (gpsScanRunning) return { ok: true, message: 'Already running' };

    gpsScanRunning = true;
    gpsScanCancelled = false;
    gpsScanProgress = { checked: 0, found: 0, total: 0 };

    // Fire and forget
    void (async () => {
      const { extractExif } = await import('../../scanner/exif.js');
      const allMissing = photoRepo.getPhotosWithoutGps(999999);
      gpsScanProgress.total = allMissing.length;

      for (const photo of allMissing) {
        if (gpsScanCancelled) break;

        const filePath = join(config.mediaRoot, photo.file_path);
        if (existsSync(filePath)) {
          const exif = await extractExif(filePath);
          if (exif.gpsLat !== null && exif.gpsLng !== null) {
            photoRepo.updateGps(photo.id, exif.gpsLat, exif.gpsLng);
            gpsScanProgress.found++;
          }
        }
        gpsScanProgress.checked++;

        // Yield every 10 photos
        if (gpsScanProgress.checked % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      gpsScanRunning = false;
    })();

    return { ok: true, message: 'GPS scan started' };
  });

  // GET /api/photos/rescan-gps/status
  app.get('/api/photos/rescan-gps/status', async () => {
    // Always show real DB counts, overlaid with in-progress scan stats
    const totalWithoutGps = (db.prepare('SELECT count(*) as c FROM photos WHERE gps_lat IS NULL AND is_video = 0').get() as { c: number }).c;
    const totalWithGps = (db.prepare('SELECT count(*) as c FROM photos WHERE gps_lat IS NOT NULL').get() as { c: number }).c;

    return {
      running: gpsScanRunning,
      withGps: totalWithGps,
      withoutGps: totalWithoutGps,
      // In-progress scan stats
      checked: gpsScanProgress.checked,
      found: gpsScanProgress.found,
      total: gpsScanRunning ? gpsScanProgress.total : totalWithoutGps,
    };
  });

  // POST /api/photos/rescan-gps/cancel
  app.post('/api/photos/rescan-gps/cancel', async () => {
    gpsScanCancelled = true;
    return { ok: true };
  });

  // POST /api/embeddings/scan — start embedding scan (non-blocking)
  app.post<{ Body: { batch_size?: number } }>('/api/embeddings/scan', async (request) => {
    const batchSize = request.body?.batch_size ?? 50;
    const { runEmbeddingScan, isEmbeddingScanRunning } = await import('../../scanner/embeddings.js');

    if (isEmbeddingScanRunning()) {
      return { ok: true, message: 'Already running' };
    }

    // Fire and forget — don't await, let it run in background
    void runEmbeddingScan(db, config, batchSize);
    return { ok: true, message: 'Embedding scan started' };
  });

  // GET /api/embeddings/status — check embedding progress
  app.get('/api/embeddings/status', async () => {
    const { isEmbeddingScanRunning } = await import('../../scanner/embeddings.js');
    const total = (db.prepare('SELECT count(*) as c FROM photos WHERE is_video = 0').get() as { c: number }).c;
    const embedded = (db.prepare('SELECT count(*) as c FROM image_embeddings').get() as { c: number }).c;
    return { running: isEmbeddingScanRunning(), total, embedded, remaining: total - embedded };
  });

  // POST /api/embeddings/cancel — cancel embedding scan
  app.post('/api/embeddings/cancel', async () => {
    const { cancelEmbeddingScan } = await import('../../scanner/embeddings.js');
    return { ok: cancelEmbeddingScan() };
  });

  // GET /api/photos/:id/visually-similar — find photos that look similar
  app.get<{ Params: { id: string }; Querystring: { limit?: string; threshold?: string } }>(
    '/api/photos/:id/visually-similar', async (request) => {
      const id = parseInt(request.params.id, 10);
      const limit = Math.min(100, parseInt(request.query.limit ?? '30', 10));
      const threshold = parseFloat(request.query.threshold ?? '0.7');

      const { findVisuallySimilar } = await import('../../scanner/embeddings.js');
      const results = findVisuallySimilar(db, id, limit, threshold);

      // Hydrate with photo data
      const photos = results.map((r) => {
        const photo = photoRepo.findById(r.photo_id);
        return photo ? { ...photo, similarity: r.similarity } : null;
      }).filter(Boolean);

      return photos;
    },
  );

  // GET /api/photos/:id/similar — find photos from same day and same person
  app.get<{ Params: { id: string } }>('/api/photos/:id/similar', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);
    if (!photo) return reply.code(404).send({ error: 'Photo not found' });
    return photoRepo.findSimilar(id);
  });

  // POST /api/photos/bulk/hide — hide photos from all views
  app.post<{ Body: { photo_ids: number[]; hidden: boolean } }>('/api/photos/bulk/hide', async (request, reply) => {
    const { photo_ids, hidden } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return reply.code(400).send({ error: 'photo_ids required' });
    }
    photoRepo.bulkSetHidden(photo_ids, hidden);
    logActivity(db, hidden ? 'photos_hidden' : 'photos_unhidden', `${photo_ids.length} photos`);
    return { ok: true, count: photo_ids.length };
  });

  // GET /api/photos/hidden — view hidden photos
  app.get<{ Querystring: { page?: string; limit?: string } }>('/api/photos/hidden', async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(200, parseInt(request.query.limit ?? '50', 10));
    const offset = (page - 1) * limit;
    const { photos, total } = photoRepo.getHiddenPhotos(limit, offset);
    return { photos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });

  // POST /api/photos/bulk/set-date — bulk update date_taken
  app.post<{ Body: { photo_ids: number[]; date: string } }>('/api/photos/bulk/set-date', async (request, reply) => {
    const { photo_ids, date } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0 || !date) {
      return reply.code(400).send({ error: 'photo_ids and date required' });
    }
    photoRepo.bulkSetDate(photo_ids, date);
    logActivity(db, 'bulk_set_date', `${photo_ids.length} photos → ${date.slice(0, 10)}`);
    return { ok: true, count: photo_ids.length };
  });

  // GET /api/photos/bad-dates — photos with missing or suspicious dates
  app.get<{ Querystring: { limit?: string } }>('/api/photos/bad-dates', async (request) => {
    const limit = Math.min(500, parseInt(request.query.limit ?? '200', 10));
    return photoRepo.getPhotosWithBadDates(limit);
  });

  // POST /api/photos/bulk/favorite — bulk set favorite
  app.post<{ Body: { photo_ids: number[]; value: boolean } }>('/api/photos/bulk/favorite', async (request, reply) => {
    const { photo_ids, value } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return reply.code(400).send({ error: 'photo_ids array is required' });
    }
    photoRepo.bulkSetFavorite(photo_ids, value);
    logActivity(db, value ? 'bulk_favorite' : 'bulk_unfavorite', `${photo_ids.length} photos`);
    return { ok: true, count: photo_ids.length };
  });

  // POST /api/photos/:id/favorite — toggle favorite
  app.post<{ Params: { id: string } }>('/api/photos/:id/favorite', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);
    if (!photo) {
      return reply.code(404).send({ error: 'Photo not found' });
    }
    const isFavorite = photoRepo.toggleFavorite(id);
    return { id, is_favorite: isFavorite };
  });

  // GET /api/photos/favorites — get favorite photos
  app.get<{
    Querystring: { page?: string; limit?: string };
  }>('/api/photos/favorites', async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
    const offset = (page - 1) * limit;
    const { photos, total } = photoRepo.getFavorites(limit, offset);
    return { photos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });

  // GET /api/stats/years — photos by year (excludes pre-1990 bogus dates)
  app.get('/api/stats/years', async () => {
    return photoRepo.getStatsByYear();
  });

  // GET /api/stats/distinct-years — just the year numbers for filters
  app.get('/api/stats/distinct-years', async () => {
    return photoRepo.getDistinctYears();
  });

  // GET /api/stats/cameras — photos by camera
  app.get('/api/stats/cameras', async () => {
    return photoRepo.getStatsByCamera();
  });

  // GET /api/stats/types — photos by file type
  app.get('/api/stats/types', async () => {
    return photoRepo.getStatsByType();
  });

  // GET /api/scan/status — current scan status
  app.get('/api/scan/status', async () => {
    const scanProgressRepo = new (await import('../../db/repositories/scan-progress.repository.js')).ScanProgressRepository(photoRepo['db']);
    const latest = scanProgressRepo.getLatest();
    return latest ?? { status: 'idle' };
  });

  // GET /api/photos/slideshow — photos for TV slideshow
  app.get<{
    Querystring: { limit?: string; shuffle?: string; album_id?: string };
  }>('/api/photos/slideshow', async (request) => {
    const limit = Math.min(5000, parseInt(request.query.limit ?? '500', 10));
    const shuffle = request.query.shuffle !== 'false';
    const albumId = request.query.album_id ? parseInt(request.query.album_id, 10) : undefined;
    return photoRepo.getSlideshow({ limit, shuffle, albumId });
  });

  // GET /api/photos/map — photos with GPS coordinates for map view
  app.get<{
    Querystring: { limit?: string };
  }>('/api/photos/map', async (request) => {
    const limit = Math.min(10000, parseInt(request.query.limit ?? '5000', 10));
    return photoRepo.getMapPoints(limit);
  });

  // GET /api/photos/search — search photos
  app.get<{
    Querystring: { q: string; page?: string; limit?: string };
  }>('/api/photos/search', async (request, reply) => {
    const query = request.query.q?.trim();
    if (!query) {
      return reply.code(400).send({ error: 'Query parameter q is required' });
    }

    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
    const offset = (page - 1) * limit;

    const { photos, total } = photoRepo.search(query, limit, offset);

    return {
      photos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // ── TV Services ──

  // GET /api/tv/status — DLNA and slideshow status
  app.get('/api/tv/status', async () => {
    const { getDlnaStatus } = await import('../dlna.js');
    return {
      dlna: getDlnaStatus(),
      slideshow: { available: true, url: '/tv' },
    };
  });

  // POST /api/tv/dlna/start — start DLNA server
  app.post('/api/tv/dlna/start', async () => {
    const { startDlnaServer, getDlnaStatus } = await import('../dlna.js');
    const { AlbumRepository } = await import('../../db/repositories/album.repository.js');
    const albumRepo = new AlbumRepository(photoRepo['db'] as import('better-sqlite3').Database);
    if (!getDlnaStatus().running) {
      startDlnaServer(photoRepo, albumRepo, config);
    }
    return { ok: true, running: true };
  });

  // POST /api/tv/dlna/stop — stop DLNA server
  app.post('/api/tv/dlna/stop', async () => {
    const { stopDlnaServer } = await import('../dlna.js');
    stopDlnaServer();
    return { ok: true, running: false };
  });

  // ── Cron management ──

  // GET /api/cron/status
  app.get('/api/cron/status', async () => {
    const { getCronStatus } = await import('../cron.js');
    return getCronStatus();
  });

  // POST /api/cron/enable
  app.post<{ Body: { enabled: boolean } }>('/api/cron/enable', async (request) => {
    const { setCronEnabled } = await import('../cron.js');
    setCronEnabled(request.body.enabled);
    return { ok: true };
  });

  // POST /api/cron/hour
  app.post<{ Body: { hour: number } }>('/api/cron/hour', async (request) => {
    const { setCronHour } = await import('../cron.js');
    setCronHour(request.body.hour);
    return { ok: true };
  });

  // POST /api/cron/trigger — run now
  app.post('/api/cron/trigger', async () => {
    const { triggerCronNow } = await import('../cron.js');
    triggerCronNow();
    return { ok: true };
  });

  // GET /api/settings — app settings
  app.get('/api/settings', async () => {
    const db = photoRepo['db'] as import('better-sqlite3').Database;
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  });

  // PUT /api/settings — update settings
  app.put<{ Body: Record<string, string> }>('/api/settings', async (request) => {
    const db = photoRepo['db'] as import('better-sqlite3').Database;
    const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
    const entries = Object.entries(request.body);
    for (const [key, value] of entries) {
      stmt.run(key, String(value));
    }
    return { ok: true };
  });

  // POST /api/backup/restore — restore database from uploaded file
  app.post('/api/backup/restore', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Validate it's a SQLite file (magic bytes)
    const magic = fileBuffer.subarray(0, 16).toString('ascii');
    if (!magic.startsWith('SQLite format 3')) {
      return reply.code(400).send({ error: 'Invalid file — not a SQLite database' });
    }

    // Write to a temp file, then swap
    const { writeFileSync, copyFileSync: cpSync } = await import('node:fs');
    const backupPath = `${config.dbPath}.pre-restore`;

    // Backup current DB before overwriting
    cpSync(config.dbPath, backupPath);
    writeFileSync(config.dbPath, fileBuffer);

    logActivity(db, 'db_restored', `Restored from uploaded backup (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB). Pre-restore backup at ${backupPath}`);

    return {
      ok: true,
      message: 'Database restored. Restart the server for changes to take effect.',
      preRestoreBackup: backupPath,
      size: fileBuffer.length,
    };
  });

  // GET /api/backup — download SQLite database backup
  app.get('/api/backup', async (_request, reply) => {
    const dbPath = config.dbPath;
    if (!existsSync(dbPath)) {
      return reply.code(404).send({ error: 'Database not found' });
    }
    // Copy to temp file to avoid locking issues
    const backupPath = `${dbPath}.backup`;
    copyFileSync(dbPath, backupPath);
    const stat = statSync(backupPath);
    logActivity(db, 'db_backup_downloaded');
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="photos-backup-${new Date().toISOString().slice(0, 10)}.db"`)
      .header('Content-Length', stat.size)
      .send(createReadStream(backupPath));
  });

  // GET /api/photos/:id/video-preview — serve a short clip for hover preview
  app.get<{ Params: { id: string } }>('/api/photos/:id/video-preview', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const photo = photoRepo.findById(id);
    if (!photo || photo.is_video !== 1) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    const filePath = join(config.mediaRoot, photo.file_path);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    // Serve the first 5 seconds via range request support
    const stat = statSync(filePath);
    const range = request.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0] ?? '0', 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 2 * 1024 * 1024, stat.size - 1); // 2MB chunks
      const chunkSize = end - start + 1;

      return reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${end}/${stat.size}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', chunkSize)
        .header('Content-Type', photo.mime_type)
        .send(createReadStream(filePath, { start, end }));
    }

    return reply
      .type(photo.mime_type)
      .header('Content-Length', stat.size)
      .header('Accept-Ranges', 'bytes')
      .send(createReadStream(filePath));
  });

  // GET /api/stats — collection statistics
  app.get('/api/stats', async () => {
    return photoRepo.getStats();
  });
}
