import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
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

const config = loadConfig();
const log = initLogger({ logLevel: config.logLevel });

const app = Fastify({ logger: false });

// CORS for Angular dev server
app.addHook('onRequest', async (request, reply) => {
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

  // Register API routes
  await app.register(photoRoutes, { photoRepo, config });
  await app.register(albumRoutes, { albumRepo });

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
