import type { FastifyInstance } from 'fastify';
import { randomBytes, randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';

export function logActivity(db: Database.Database, action: string, details?: string): void {
  db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').run(action, details ?? null);
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database },
): Promise<void> {
  const { db } = opts;

  // POST /api/auth/generate-code — generate a 6-digit pairing code (run on the server/CLI)
  app.post('/api/auth/generate-code', async () => {
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
    db.prepare('INSERT OR REPLACE INTO pairing_codes (code, expires_at, used) VALUES (?, ?, 0)').run(code, expiresAt);
    logActivity(db, 'pairing_code_generated');
    return { code, expires_at: expiresAt };
  });

  // POST /api/auth/pair — exchange pairing code for API key
  app.post<{ Body: { code: string; device_name: string } }>('/api/auth/pair', async (request, reply) => {
    const { code, device_name } = request.body;
    if (!code || !device_name) {
      return reply.code(400).send({ error: 'code and device_name required' });
    }

    const row = db.prepare(
      "SELECT * FROM pairing_codes WHERE code = ? AND used = 0 AND expires_at > datetime('now')",
    ).get(code) as { code: string } | undefined;

    if (!row) {
      return reply.code(401).send({ error: 'Invalid or expired pairing code' });
    }

    // Mark code as used
    db.prepare('UPDATE pairing_codes SET used = 1 WHERE code = ?').run(code);

    // Create device with API key
    const apiKey = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO devices (name, api_key) VALUES (?, ?)').run(device_name.trim(), apiKey);
    logActivity(db, 'device_paired', device_name);

    return { api_key: apiKey, device_name: device_name.trim() };
  });

  // GET /api/auth/devices — list paired devices
  app.get('/api/auth/devices', async () => {
    return db.prepare('SELECT id, name, is_active, paired_at, last_seen FROM devices ORDER BY paired_at DESC').all();
  });

  // DELETE /api/auth/devices/:id — revoke a device
  app.delete<{ Params: { id: string } }>('/api/auth/devices/:id', async (request) => {
    const id = parseInt(request.params.id, 10);
    const device = db.prepare('SELECT name FROM devices WHERE id = ?').get(id) as { name: string } | undefined;
    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    if (device) logActivity(db, 'device_revoked', device.name);
    return { ok: true };
  });

  // GET /api/activity — activity log
  app.get<{ Querystring: { limit?: string } }>('/api/activity', async (request) => {
    const limit = Math.min(500, parseInt(request.query.limit ?? '100', 10));
    return db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit);
  });
}

/**
 * Auth middleware — checks Authorization header against devices table.
 * Only active when auth_required setting is 'true'.
 */
export function createAuthMiddleware(db: Database.Database): (request: { headers: { authorization?: string }; url: string }, reply: { code: (n: number) => { send: (body: unknown) => unknown } }) => void {
  return (request, reply) => {
    // Check if auth is required
    const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'auth_required'").get() as { value: string } | undefined;
    if (setting?.value !== 'true') return; // Auth not required

    // Allow pairing and shared endpoints without auth
    const publicPaths = ['/api/auth/pair', '/api/shared/', '/health'];
    if (publicPaths.some((p) => request.url.startsWith(p))) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const apiKey = authHeader.slice(7);
    const device = db.prepare(
      'SELECT id, name FROM devices WHERE api_key = ? AND is_active = 1',
    ).get(apiKey) as { id: number; name: string } | undefined;

    if (!device) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    // Update last_seen
    db.prepare("UPDATE devices SET last_seen = datetime('now') WHERE id = ?").run(device.id);
  };
}
