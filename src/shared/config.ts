import { config as loadDotenv } from 'dotenv';
import type { AppConfig } from './types.js';

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

function parseLogLevel(value: string | undefined): AppConfig['logLevel'] {
  const level = value ?? 'info';
  if (LOG_LEVELS.has(level)) {
    return level as AppConfig['logLevel'];
  }
  return 'info';
}

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  loadDotenv();

  return {
    mediaRoot: process.env['PM_MEDIA_ROOT'] ?? '/photos',
    dbPath: process.env['PM_DB_PATH'] ?? './data/photos.db',
    thumbnailDir: process.env['PM_THUMBNAIL_DIR'] ?? './data/thumbnails',
    dropboxDir: process.env['PM_DROPBOX_DIR'] ?? './data/inbox',
    serverPort: parseInt(process.env['PM_PORT'] ?? '3000', 10),
    serverHost: process.env['PM_HOST'] ?? '0.0.0.0',
    scanConcurrency: parseInt(process.env['PM_SCAN_CONCURRENCY'] ?? '4', 10),
    scanBatchSize: parseInt(process.env['PM_SCAN_BATCH_SIZE'] ?? '50', 10),
    thumbnailSize: parseInt(process.env['PM_THUMB_SIZE'] ?? '400', 10),
    thumbnailQuality: parseInt(process.env['PM_THUMB_QUALITY'] ?? '80', 10),
    logLevel: parseLogLevel(process.env['PM_LOG_LEVEL']),
    ...overrides,
  };
}
