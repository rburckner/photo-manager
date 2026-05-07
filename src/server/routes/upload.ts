import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import { ingestBuffer } from '../../ingestion/index.js';
import type { AppConfig } from '../../shared/types.js';
import { logActivity } from './auth.js';
import { getLogger } from '../../shared/logger.js';

interface UploadOpts {
  photoRepo: PhotoRepository;
  config: AppConfig;
  db: Database.Database;
}

interface DeviceRow {
  id: number;
  name: string;
}

/**
 * Verify the request's Authorization header against the devices table.
 * Returns the device on success, or null. Always required for uploads —
 * regardless of the global `auth_required` setting, since uploads are
 * write operations that need attribution.
 */
function authenticateDevice(
  db: Database.Database,
  authHeader: string | undefined,
): DeviceRow | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const apiKey = authHeader.slice(7);
  const device = db.prepare(
    'SELECT id, name FROM devices WHERE api_key = ? AND is_active = 1',
  ).get(apiKey) as DeviceRow | undefined;
  if (!device) return null;
  db.prepare("UPDATE devices SET last_seen = datetime('now') WHERE id = ?").run(device.id);
  return device;
}

export async function uploadRoutes(
  app: FastifyInstance,
  opts: UploadOpts,
): Promise<void> {
  const { photoRepo, config, db } = opts;
  const log = getLogger();

  // POST /api/upload — single-file upload from a paired device
  app.post('/api/upload', async (request, reply) => {
    const device = authenticateDevice(db, request.headers.authorization);
    if (!device) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const part = await request.file({ limits: { fileSize: 500 * 1024 * 1024 } });
    if (!part) {
      return reply.code(400).send({ error: 'No file provided' });
    }

    const buffer = await part.toBuffer();
    const result = await ingestBuffer(buffer, part.filename, config, photoRepo);

    if (result.action === 'imported') {
      logActivity(db, 'upload', `${device.name}: ${part.filename}`);
    }

    log.info({
      device: device.name,
      file: part.filename,
      action: result.action,
      hash: result.hash,
    }, 'Upload received');

    return result;
  });

  // GET /api/upload/check?hash=... — let clients ask "do you already have this file?"
  // before uploading the bytes. Saves bandwidth on retries and re-syncs.
  app.get<{ Querystring: { hash?: string } }>(
    '/api/upload/check',
    async (request, reply) => {
      const device = authenticateDevice(db, request.headers.authorization);
      if (!device) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      const hash = request.query.hash;
      if (!hash || typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) {
        return reply.code(400).send({ error: 'Valid sha256 hash query param required' });
      }
      const existing = photoRepo.findByHash(hash);
      return { exists: existing.length > 0 };
    },
  );
}
