#!/usr/bin/env node

import { Command } from 'commander';
import { createScanCommand } from './commands/scan.js';
import { getDb, closeDb } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { loadConfig } from '../shared/config.js';
import { initLogger } from '../shared/logger.js';

const program = new Command();

program
  .name('photo-manager')
  .description('Self-hosted photo management CLI')
  .version('0.1.0');

// ── scan command ──
program.addCommand(createScanCommand());

// ── migrate command ──
program
  .command('migrate')
  .description('Run database migrations')
  .option('-v, --verbose', 'Verbose logging')
  .action((options: { verbose?: boolean }) => {
    const config = loadConfig();
    const log = initLogger({ logLevel: options.verbose ? 'debug' : config.logLevel });

    const db = getDb(config.dbPath);
    runMigrations(db);
    closeDb();

    log.info('Migrations complete');
  });

// ── stats command ──
program
  .command('stats')
  .description('Show database statistics')
  .action(() => {
    const config = loadConfig();
    initLogger({ logLevel: config.logLevel });

    const db = getDb(config.dbPath);
    runMigrations(db);

    const photoRepo = new PhotoRepository(db);
    const stats = photoRepo.getStats();

    console.log('\nPhoto Manager Statistics:');
    console.log(`  Total items:     ${stats.total.toLocaleString()}`);
    console.log(`  Images:          ${(stats.images ?? 0).toLocaleString()}`);
    console.log(`  Videos:          ${(stats.videos ?? 0).toLocaleString()}`);
    console.log(`  Total size:      ${formatBytes(stats.totalSize ?? 0)}`);
    if (stats.earliestDate) {
      console.log(`  Date range:      ${stats.earliestDate.slice(0, 10)} to ${stats.latestDate?.slice(0, 10) ?? 'unknown'}`);
    }
    console.log();

    closeDb();
  });

program.parse();

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}
