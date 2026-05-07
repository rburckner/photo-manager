import { FastifyInstance } from 'fastify';
import { join } from 'node:path';
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

  // GET /api/stats — collection statistics
  app.get('/api/stats', async () => {
    return photoRepo.getStats();
  });
}
