import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkNasHealth, getNasHealth } from './nas-health.js';
import { initLogger } from '../shared/logger.js';
import type { AppConfig } from '../shared/types.js';

initLogger({ logLevel: 'error' });

function makeConfig(mediaRoot: string): AppConfig {
  return {
    mediaRoot,
    dbPath: ':memory:',
    thumbnailDir: '/tmp/thumbs',
    dropboxDir: '/tmp/inbox',
    serverPort: 3000,
    serverHost: '0.0.0.0',
    scanConcurrency: 1,
    scanBatchSize: 1,
    thumbnailSize: 400,
    thumbnailQuality: 80,
    logLevel: 'error',
  };
}

describe('checkNasHealth', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pm-nas-health-test-'));
  });

  afterEach(() => {
    // Restore perms in case a test chmod'd
    try { chmodSync(workDir, 0o755); } catch { /* ignore */ }
    rmSync(workDir, { recursive: true, force: true });
  });

  it('reports rw when the directory exists and is writable', async () => {
    const result = await checkNasHealth(makeConfig(workDir));
    expect(result.state).toBe('rw');
    expect(result.mediaRoot).toBe(workDir);
    expect(result.checkedAt).toBeTruthy();
    expect(result.error).toBeUndefined();
  });

  it('reports missing when the directory does not exist', async () => {
    const result = await checkNasHealth(makeConfig(join(workDir, 'does-not-exist')));
    expect(result.state).toBe('missing');
    expect(result.error).toContain('ENOENT');
  });

  it('reports missing when the path is a file instead of a directory', async () => {
    const filePath = join(workDir, 'i-am-a-file.txt');
    writeFileSync(filePath, 'hello');
    const result = await checkNasHealth(makeConfig(filePath));
    expect(result.state).toBe('missing');
    expect(result.error).toContain('not a directory');
  });

  it('reports ro when the directory exists but is not writable', async () => {
    const roDir = join(workDir, 'readonly');
    mkdirSync(roDir);
    chmodSync(roDir, 0o555); // read+execute only

    try {
      const result = await checkNasHealth(makeConfig(roDir));
      expect(result.state).toBe('ro');
      expect(result.error).toBeTruthy();
    } finally {
      chmodSync(roDir, 0o755);
    }
  });

  it('cleans up the probe file when the write succeeds', async () => {
    const result = await checkNasHealth(makeConfig(workDir));
    expect(result.state).toBe('rw');

    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(workDir).filter((n) => n.startsWith('.pm-write-probe'));
    expect(remaining).toEqual([]);
  });

  it('caches the most recent state for synchronous getNasHealth() reads', async () => {
    await checkNasHealth(makeConfig(workDir));
    expect(getNasHealth().state).toBe('rw');

    await checkNasHealth(makeConfig(join(workDir, 'gone')));
    expect(getNasHealth().state).toBe('missing');
  });
});
