import type { FastifyInstance } from 'fastify';
import { TagRepository } from '../../db/repositories/tag.repository.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';

export async function tagRoutes(
  app: FastifyInstance,
  opts: { tagRepo: TagRepository; photoRepo: PhotoRepository },
): Promise<void> {
  const { tagRepo, photoRepo } = opts;

  app.get('/api/tags', async () => tagRepo.list());

  app.post<{ Body: { name: string; color?: string } }>('/api/tags', async (request, reply) => {
    const { name, color } = request.body;
    if (typeof name !== 'string' || !name.trim()) return reply.code(400).send({ error: 'Name is required' });
    return tagRepo.create(name.trim(), color);
  });

  app.delete<{ Params: { id: string } }>('/api/tags/:id', async (request) => {
    tagRepo.delete(parseInt(request.params.id, 10));
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { photo_ids: number[] } }>(
    '/api/tags/:id/photos', async (request, reply) => {
      const { photo_ids } = request.body;
      if (!Array.isArray(photo_ids)) return reply.code(400).send({ error: 'photo_ids required' });
      tagRepo.addToPhotos(parseInt(request.params.id, 10), photo_ids);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string }; Body: { photo_ids: number[] } }>(
    '/api/tags/:id/photos', async (request, reply) => {
      const { photo_ids } = request.body;
      if (!Array.isArray(photo_ids)) return reply.code(400).send({ error: 'photo_ids required' });
      tagRepo.removeFromPhotos(parseInt(request.params.id, 10), photo_ids);
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/api/tags/:id/photos', async (request) => {
      const tagId = parseInt(request.params.id, 10);
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(200, parseInt(request.query.limit ?? '50', 10));
      const offset = (page - 1) * limit;

      const { photoIds, total } = tagRepo.getPhotosByTag(tagId, limit, offset);
      const photos = photoIds.map((id) => photoRepo.findById(id)).filter(Boolean);

      return { photos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },
  );

  app.get<{ Params: { photoId: string } }>('/api/photos/:photoId/tags', async (request) => {
    return tagRepo.getTagsForPhoto(parseInt(request.params.photoId, 10));
  });
}
