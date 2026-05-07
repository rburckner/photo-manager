#!/usr/bin/env node

import { Command } from 'commander';
import { createScanCommand } from './commands/scan.js';
import { createImportTakeoutCommand } from './commands/import-takeout.js';
import { createPairCommand } from './commands/pair.js';
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

// ── import-takeout command ──
program.addCommand(createImportTakeoutCommand());

// ── pair command ──
program.addCommand(createPairCommand());

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

// ── ingest command ──
program
  .command('ingest')
  .description('Process files in the inbox directory')
  .action(async () => {
    const config = loadConfig();
    initLogger({ logLevel: config.logLevel });

    const db = getDb(config.dbPath);
    runMigrations(db);

    const photoRepo = new PhotoRepository(db);
    const { processInbox } = await import('../ingestion/index.js');
    const results = await processInbox(config, photoRepo);

    const imported = results.filter((r) => r.action === 'imported').length;
    const indexed = results.filter((r) => r.action === 'imported' && r.indexed).length;
    const duplicates = results.filter((r) => r.action === 'duplicate').length;
    const errors = results.filter((r) => r.action === 'error').length;

    console.log(`\nIngest complete:`);
    console.log(`  Imported:    ${imported} (${indexed} indexed)`);
    console.log(`  Duplicates:  ${duplicates}`);
    console.log(`  Errors:      ${errors}`);

    closeDb();
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
    console.log(`  Images:          ${stats.images.toLocaleString()}`);
    console.log(`  Videos:          ${stats.videos.toLocaleString()}`);
    console.log(`  Total size:      ${formatBytes(stats.totalSize)}`);
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
