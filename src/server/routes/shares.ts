import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createReadStream, existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { AlbumRepository } from '../../db/repositories/album.repository.js';
import type { AppConfig } from '../../shared/types.js';

export async function shareRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database; photoRepo: PhotoRepository; albumRepo: AlbumRepository; config: AppConfig },
): Promise<void> {
  const { db, photoRepo, albumRepo, config } = opts;

  // POST /api/shares — create a share link
  app.post<{
    Body: { photo_id?: number; album_id?: number; expires_hours?: number };
  }>('/api/shares', async (request, reply) => {
    const { photo_id, album_id, expires_hours = 24 } = request.body;
    if (!photo_id && !album_id) {
      return reply.code(400).send({ error: 'photo_id or album_id required' });
    }

    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + expires_hours * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO shares (token, photo_id, album_id, expires_at) VALUES (?, ?, ?, ?)',
    ).run(token, photo_id ?? null, album_id ?? null, expiresAt);

    return { token, expires_at: expiresAt };
  });

  // GET /api/shares — list active shares
  app.get('/api/shares', async () => {
    return db.prepare(
      "SELECT * FROM shares WHERE expires_at > datetime('now') ORDER BY created_at DESC",
    ).all();
  });

  // DELETE /api/shares/:token — revoke a share
  app.delete<{ Params: { token: string } }>('/api/shares/:token', async (request) => {
    db.prepare('DELETE FROM shares WHERE token = ?').run(request.params.token);
    return { ok: true };
  });

  // GET /api/shared/:token — public view of shared photo/album
  app.get<{ Params: { token: string } }>('/api/shared/:token', async (request, reply) => {
    const share = db.prepare(
      "SELECT * FROM shares WHERE token = ? AND expires_at > datetime('now')",
    ).get(request.params.token) as { photo_id: number | null; album_id: number | null } | undefined;

    if (!share) {
      return reply.code(404).send({ error: 'Share not found or expired' });
    }

    if (share.photo_id) {
      return photoRepo.findById(share.photo_id);
    }

    if (share.album_id) {
      const album = albumRepo.findById(share.album_id);
      const { photos } = albumRepo.getPhotos(share.album_id, 200, 0);
      return { album, photos };
    }

    return reply.code(404).send({ error: 'Invalid share' });
  });

  // GET /api/shared/:token/file — serve the shared photo file (no auth needed)
  app.get<{ Params: { token: string } }>('/api/shared/:token/file', async (request, reply) => {
    const share = db.prepare(
      "SELECT * FROM shares WHERE token = ? AND expires_at > datetime('now')",
    ).get(request.params.token) as { photo_id: number | null } | undefined;

    if (!share?.photo_id) {
      return reply.code(404).send({ error: 'Share not found or expired' });
    }

    const photo = photoRepo.findById(share.photo_id);
    if (!photo) return reply.code(404).send({ error: 'Photo not found' });

    const filePath = join(config.mediaRoot, photo.file_path);
    if (!existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    return reply
      .type(photo.mime_type)
      .header('Cache-Control', 'public, max-age=3600')
      .send(createReadStream(filePath));
  });
}
