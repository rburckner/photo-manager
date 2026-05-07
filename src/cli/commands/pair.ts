import { Command } from 'commander';
import { randomInt } from 'node:crypto';
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { loadConfig } from '../../shared/config.js';
import { initLogger } from '../../shared/logger.js';

export function createPairCommand(): Command {
  return new Command('pair')
    .description('Generate a 6-digit pairing code for device authentication')
    .action(() => {
      const config = loadConfig();
      initLogger({ logLevel: config.logLevel });

      const db = getDb(config.dbPath);
      runMigrations(db);

      const code = String(randomInt(100000, 999999));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      db.prepare('INSERT OR REPLACE INTO pairing_codes (code, expires_at, used) VALUES (?, ?, 0)')
        .run(code, expiresAt);

      console.log('\n┌─────────────────────────────┐');
      console.log(`│   Pairing Code: ${code}      │`);
      console.log('│   Expires in 5 minutes       │');
      console.log('└─────────────────────────────┘\n');
      console.log('Enter this code in the app to pair your device.\n');

      closeDb();
    });
}
