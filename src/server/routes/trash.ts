import type { FastifyInstance } from 'fastify';
import { rename, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import type { AppConfig, PhotoRow } from '../../shared/types.js';
import { requireLocalNetwork } from '../network-guard.js';
import { getLogger } from '../../shared/logger.js';

interface TrashRouteOpts {
  photoRepo: PhotoRepository;
  config: AppConfig;
}

interface BatchBody {
  ids: number[];
}

/**
 * Move a file from src to dest within the same NAS volume using rename().
 * Falls back to nothing — cross-volume copy is intentionally not supported here
 * because trash lives in the same mediaRoot.
 */
async function moveFile(srcAbs: string, destAbs: string): Promise<void> {
  await mkdir(dirname(destAbs), { recursive: true });
  await rename(srcAbs, destAbs);
}

function trashRelativePath(hash: string, ext: string, deletedAt: Date): string {
  const ym = `${deletedAt.getUTCFullYear()}-${String(deletedAt.getUTCMonth() + 1).padStart(2, '0')}`;
  return join('.trash', ym, `${hash}${ext}`);
}

function extOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 ? filePath.slice(dot) : '';
}

export async function trashRoutes(
  app: FastifyInstance,
  opts: TrashRouteOpts,
): Promise<void> {
  const { photoRepo, config } = opts;
  const log = getLogger();

  /**
   * Move a single photo into trash. Returns true if moved, false if missing/already-trashed.
   */
  async function trashOne(photo: PhotoRow): Promise<boolean> {
    if (photo.deleted_at) return false;

    const ext = extOf(photo.file_path);
    const trashRel = trashRelativePath(photo.file_hash, ext, new Date());
    const srcAbs = join(config.mediaRoot, photo.file_path);
    const destAbs = join(config.mediaRoot, trashRel);

    try {
      await moveFile(srcAbs, destAbs);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn({ photoId: photo.id, srcAbs, destAbs, error }, 'Trash move failed');
      throw err;
    }

    photoRepo.markTrashed(photo.id, trashRel);
    return true;
  }

  /**
   * Restore a single photo from trash. Returns true if restored, false if missing/not-trashed.
   */
  async function restoreOne(photo: PhotoRow): Promise<boolean> {
    if (!photo.deleted_at || !photo.trash_path || !photo.original_path) return false;

    const srcAbs = join(config.mediaRoot, photo.trash_path);
    const destAbs = join(config.mediaRoot, photo.original_path);

    try {
      await moveFile(srcAbs, destAbs);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn({ photoId: photo.id, srcAbs, destAbs, error }, 'Restore move failed');
      throw err;
    }

    photoRepo.markRestored(photo.id);
    return true;
  }

  /**
   * Permanently delete a trashed photo. Unlinks the file + thumbnail and removes DB row.
   */
  async function purgeOne(photo: PhotoRow): Promise<boolean> {
    if (!photo.deleted_at || !photo.trash_path) return false;

    const fileAbs = join(config.mediaRoot, photo.trash_path);
    try {
      await unlink(fileAbs);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // ENOENT means file already gone — not fatal, still purge the DB row.
      if (!error.includes('ENOENT')) {
        log.warn({ photoId: photo.id, fileAbs, error }, 'Purge file unlink failed');
      }
    }

    if (photo.thumbnail_path) {
      const thumbAbs = join(config.thumbnailDir, photo.thumbnail_path);
      try {
        await unlink(thumbAbs);
      } catch {
        // Thumbnails are regenerable, ignore failures.
      }
    }

    photoRepo.purgeRow(photo.id);
    return true;
  }

  // ── Trash a single photo ──
  app.post<{ Params: { id: string } }>(
    '/api/photos/:id/trash',
    { preHandler: requireLocalNetwork },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      const photo = photoRepo.findById(id);
      if (!photo) return reply.code(404).send({ error: 'Photo not found' });
      const moved = await trashOne(photo);
      return { ok: true, moved };
    },
  );

  // ── Batch trash ──
  app.post<{ Body: BatchBody }>(
    '/api/photos/trash',
    { preHandler: requireLocalNetwork },
    async (request, reply) => {
      const ids = request.body.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: 'ids array required' });
      }
      let moved = 0;
      const errors: Array<{ id: number; error: string }> = [];
      for (const id of ids) {
        const photo = photoRepo.findById(id);
        if (!photo) continue;
        try {
          if (await trashOne(photo)) moved++;
        } catch (err) {
          errors.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { moved, errors };
    },
  );

  // ── Restore a single photo ──
  app.post<{ Params: { id: string } }>(
    '/api/photos/:id/restore',
    { preHandler: requireLocalNetwork },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      const photo = photoRepo.findById(id);
      if (!photo) return reply.code(404).send({ error: 'Photo not found' });
      const restored = await restoreOne(photo);
      return { ok: true, restored };
    },
  );

  // ── Batch restore ──
  app.post<{ Body: BatchBody }>(
    '/api/photos/restore',
    { preHandler: requireLocalNetwork },
    async (request, reply) => {
      const ids = request.body.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: 'ids array required' });
      }
      let restored = 0;
      const errors: Array<{ id: number; error: string }> = [];
      for (const id of ids) {
        const photo = photoRepo.findById(id);
        if (!photo) continue;
        try {
          if (await restoreOne(photo)) restored++;
        } catch (err) {
          errors.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { restored, errors };
    },
  );

  // ── Permanent delete a single photo ──
  app.delete<{ Params: { id: string } }>(
    '/api/photos/:id/forever',
    { preHandler: requireLocalNetwork },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      const photo = photoRepo.findById(id);
      if (!photo) return reply.code(404).send({ error: 'Photo not found' });
      if (!photo.deleted_at) {
        return reply.code(400).send({ error: 'Photo must be in trash before permanent delete' });
      }
      const purged = await purgeOne(photo);
      return { ok: true, purged };
    },
  );

  // ── List trashed photos ──
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/api/trash',
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '50', 10)));
      const offset = (page - 1) * limit;
      const { photos, total } = photoRepo.getTrashed({ limit, offset });
      return {
        photos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // ── Trash stats ──
  app.get('/api/trash/stats', async () => {
    return photoRepo.getTrashStats();
  });

  // ── Empty trash (purge all) ──
  app.post(
    '/api/trash/empty',
    { preHandler: requireLocalNetwork },
    async () => {
      const trashed = photoRepo.getAllTrashed();
      let purged = 0;
      for (const photo of trashed) {
        try {
          if (await purgeOne(photo)) purged++;
        } catch (err) {
          log.warn({ photoId: photo.id, err }, 'Empty-trash failed for photo');
        }
      }
      return { purged };
    },
  );

  // ── Restore all ──
  app.post(
    '/api/trash/restore-all',
    { preHandler: requireLocalNetwork },
    async () => {
      const trashed = photoRepo.getAllTrashed();
      let restored = 0;
      const errors: Array<{ id: number; error: string }> = [];
      for (const photo of trashed) {
        try {
          if (await restoreOne(photo)) restored++;
        } catch (err) {
          errors.push({ id: photo.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { restored, errors };
    },
  );

}
