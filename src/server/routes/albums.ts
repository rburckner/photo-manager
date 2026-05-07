import type { FastifyInstance } from 'fastify';
import { AlbumRepository } from '../../db/repositories/album.repository.js';

export async function albumRoutes(
  app: FastifyInstance,
  opts: { albumRepo: AlbumRepository },
): Promise<void> {
  const { albumRepo } = opts;

  // GET /api/albums — list all albums
  app.get('/api/albums', async () => {
    return albumRepo.list();
  });

  // POST /api/albums — create album
  app.post<{
    Body: { name: string; description?: string };
  }>('/api/albums', async (request, reply) => {
    const { name, description } = request.body;
    if (!name?.trim()) {
      return reply.code(400).send({ error: 'Name is required' });
    }
    return albumRepo.create({ name: name.trim(), description: description?.trim() });
  });

  // GET /api/albums/:id — get album details
  app.get<{ Params: { id: string } }>('/api/albums/:id', async (request, reply) => {
    const album = albumRepo.findById(parseInt(request.params.id, 10));
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }
    return album;
  });

  // PUT /api/albums/:id — update album
  app.put<{
    Params: { id: string };
    Body: { name?: string; description?: string; cover_photo_id?: number | null };
  }>('/api/albums/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const album = albumRepo.update(id, request.body);
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }
    return album;
  });

  // DELETE /api/albums/:id — delete album
  app.delete<{ Params: { id: string } }>('/api/albums/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const album = albumRepo.findById(id);
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }
    albumRepo.delete(id);
    return { ok: true };
  });

  // GET /api/albums/:id/photos — get photos in album
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string };
  }>('/api/albums/:id/photos', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const album = albumRepo.findById(id);
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }

    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '100', 10)));
    const offset = (page - 1) * limit;

    const { photos, total } = albumRepo.getPhotos(id, limit, offset);

    return {
      photos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // POST /api/albums/:id/photos — add photos to album
  app.post<{
    Params: { id: string };
    Body: { photo_ids: number[] };
  }>('/api/albums/:id/photos', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const album = albumRepo.findById(id);
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }

    const { photo_ids } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return reply.code(400).send({ error: 'photo_ids array is required' });
    }

    albumRepo.addPhotos(id, photo_ids);
    return { ok: true, added: photo_ids.length };
  });

  // DELETE /api/albums/:id/photos — remove photos from album
  app.delete<{
    Params: { id: string };
    Body: { photo_ids: number[] };
  }>('/api/albums/:id/photos', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const album = albumRepo.findById(id);
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }

    const { photo_ids } = request.body;
    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return reply.code(400).send({ error: 'photo_ids array is required' });
    }

    albumRepo.removePhotos(id, photo_ids);
    return { ok: true, removed: photo_ids.length };
  });

  // PUT /api/albums/:id/reorder — reorder photos in album
  app.put<{
    Params: { id: string };
    Body: { photo_ids: number[] };
  }>('/api/albums/:id/reorder', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const album = albumRepo.findById(id);
    if (!album) {
      return reply.code(404).send({ error: 'Album not found' });
    }

    albumRepo.reorderPhotos(id, request.body.photo_ids);
    return { ok: true };
  });
}
