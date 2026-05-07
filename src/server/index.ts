import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../shared/config.js';
import { initLogger, getLogger } from '../shared/logger.js';
import { getDb, closeDb } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { AlbumRepository } from '../db/repositories/album.repository.js';
import { photoRoutes } from './routes/photos.js';
import { albumRoutes } from './routes/albums.js';
import { faceRoutes } from './routes/faces.js';
import { tagRoutes } from './routes/tags.js';
import { shareRoutes } from './routes/shares.js';
import { FaceRepository } from '../db/repositories/face.repository.js';
import { TagRepository } from '../db/repositories/tag.repository.js';
import { authRoutes, createAuthMiddleware } from './routes/auth.js';
import { notificationRoutes } from './routes/notifications.js';
import { trashRoutes } from './routes/trash.js';
import { startDlnaServer } from './dlna.js';
import { startInboxWatcher } from '../ingestion/index.js';
import { startCronReindex } from './cron.js';
import { ScanProgressRepository } from '../db/repositories/scan-progress.repository.js';
import { isPrivateIp } from './network-guard.js';

const config = loadConfig();
const log = initLogger({ logLevel: config.logLevel });

const app = Fastify({ logger: false });

// File upload support (for DB restore)
await app.register(fastifyMultipart, { limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

// Local network guard — reject non-private IPs unless PM_ALLOW_REMOTE=true
const allowRemote = process.env['PM_ALLOW_REMOTE'] === 'true';

app.addHook('onRequest', async (request, reply) => {
  // Network access control
  if (!allowRemote) {
    const clientIp = request.ip;
    if (!isPrivateIp(clientIp)) {
      return reply.code(403).send({ error: 'Access denied — local network only' });
    }
  }

  // CORS for Angular dev server
  const origin = request.headers.origin;
  if (origin) {
    void reply.header('Access-Control-Allow-Origin', origin);
    void reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    void reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (request.method === 'OPTIONS') {
    return reply.code(204).send();
  }
});

// Health check
app.get('/health', async () => {
  return { status: 'ok' };
});

async function start(): Promise<void> {
  const db = getDb(config.dbPath);
  runMigrations(db);

  const photoRepo = new PhotoRepository(db);
  const albumRepo = new AlbumRepository(db);

  // Ensure default TV album exists
  const tvAlbumName = 'TV Slideshow';
  const existingAlbums = albumRepo.list();
  if (!existingAlbums.some((a) => a.name === tvAlbumName)) {
    albumRepo.create({ name: tvAlbumName, description: 'Photos displayed on the TV slideshow' });
    log.info('Created default "TV Slideshow" album');
  }

  // Register API routes
  await app.register(photoRoutes, { photoRepo, config, db });
  await app.register(albumRoutes, { albumRepo, db });

  const faceRepo = new FaceRepository(db);
  const tagRepo = new TagRepository(db);

  await app.register(faceRoutes, { faceRepo, photoRepo, config });
  await app.register(tagRoutes, { tagRepo, photoRepo });
  await app.register(shareRoutes, { db, photoRepo, albumRepo, config });
  await app.register(authRoutes, { db });
  await app.register(notificationRoutes, { db });
  await app.register(trashRoutes, { photoRepo, config });

  // Optional auth middleware (enabled via Settings → auth_required=true)
  const authMiddleware = createAuthMiddleware(db);
  app.addHook('onRequest', async (request, reply) => {
    authMiddleware(request, reply);
  });

  // Serve Angular build if it exists (production mode)
  const webDistPath = join(import.meta.dirname, '../../web/dist/photo-manager/browser');
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback — serve index.html for non-API routes
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    getLogger().warn('Angular build not found at %s — serving API only', webDistPath);
  }

  await app.listen({ port: config.serverPort, host: config.serverHost });
  log.info({ port: config.serverPort, host: config.serverHost }, 'Server started');

  // Start DLNA server for TV discovery on local network
  startDlnaServer(photoRepo, albumRepo, config);

  // Start inbox watcher for photo ingestion
  startInboxWatcher(config, photoRepo);

  // Start daily re-index cron (default 2 AM)
  const scanProgressRepo = new ScanProgressRepository(db);
  startCronReindex(config, photoRepo, scanProgressRepo, faceRepo);

  const shutdown = async (): Promise<void> => {
    log.info('Shutting down...');
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void start();
