import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

export function createNotification(db: Database.Database, type: string, title: string, message?: string): void {
  db.prepare('INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)').run(type, title, message ?? null);
}

export async function notificationRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database },
): Promise<void> {
  const { db } = opts;

  // GET /api/notifications — recent notifications
  app.get<{ Querystring: { limit?: string; unread_only?: string } }>('/api/notifications', async (request) => {
    const limit = Math.min(100, parseInt(request.query.limit ?? '20', 10));
    const unreadOnly = request.query.unread_only === 'true';
    const where = unreadOnly ? 'WHERE read = 0' : '';
    return db.prepare(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ?`).all(limit);
  });

  // GET /api/notifications/unread-count
  app.get('/api/notifications/unread-count', async () => {
    const row = db.prepare('SELECT count(*) as count FROM notifications WHERE read = 0').get() as { count: number };
    return { count: row.count };
  });

  // POST /api/notifications/:id/read — mark as read
  app.post<{ Params: { id: string } }>('/api/notifications/:id/read', async (request) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(parseInt(request.params.id, 10));
    return { ok: true };
  });

  // POST /api/notifications/read-all — mark all as read
  app.post('/api/notifications/read-all', async () => {
    db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    return { ok: true };
  });

  // DELETE /api/notifications/:id
  app.delete<{ Params: { id: string } }>('/api/notifications/:id', async (request) => {
    db.prepare('DELETE FROM notifications WHERE id = ?').run(parseInt(request.params.id, 10));
    return { ok: true };
  });
}
