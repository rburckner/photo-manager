import { FastifyInstance } from 'fastify';
import { join, extname } from 'node:path';
import { createReadStream, existsSync } from 'node:fs';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import type { AppConfig } from '../../shared/types.js';

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
  opts: { photoRepo: PhotoRepository; config: AppConfig },
): Promise<void> {
  const { photoRepo, config } = opts;

  // GET /api/photos — paginated list
  app.get<{
    Querystring: { page?: string; limit?: string; folder?: string };
  }>('/api/photos', async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
    const offset = (page - 1) * limit;
    const folder = request.query.folder;

    const { photos, total } = photoRepo.list({ limit, offset, folder });

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

  // POST /api/photos/generate-thumbnails — backfill missing thumbnails
  app.post<{ Body: { limit?: number } }>('/api/photos/generate-thumbnails', async (request) => {
    const limit = request.body?.limit ?? 100;
    const { generateThumbnail } = await import('../../scanner/thumbnails.js');
    const missing = photoRepo.getPhotosWithoutThumbnails(limit);
    let generated = 0;

    for (const photo of missing) {
      const filePath = join(config.mediaRoot, photo.file_path);
      const thumbPath = await generateThumbnail(filePath, photo.file_name, photo.is_video === 1, {
        size: 400, quality: 80, outputDir: config.thumbnailDir,
      });
      if (thumbPath) {
        photoRepo.setThumbnailPath(photo.id, thumbPath);
        generated++;
      }
    }

    return { checked: missing.length, generated };
  });

  // GET /api/photos/duplicates — files with same hash in different paths
  app.get('/api/photos/duplicates', async () => {
    return photoRepo.getDuplicates();
  });

  // POST /api/photos/bulk/favorite — bulk set favorite
  app.post<{ Body: { photo_ids: number[]; value: boolean } }>('/api/photos/bulk/favorite', async (request, reply) => {
    const { photo_ids, value } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return reply.code(400).send({ error: 'photo_ids array is required' });
    }
    photoRepo.bulkSetFavorite(photo_ids, value);
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

  // GET /api/stats — collection statistics
  app.get('/api/stats', async () => {
    return photoRepo.getStats();
  });
}
