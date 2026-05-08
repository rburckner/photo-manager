import { stat, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

export type NasHealthState = 'rw' | 'ro' | 'missing' | 'unknown';

export interface NasHealth {
  state: NasHealthState;
  mediaRoot: string;
  checkedAt: string; // ISO timestamp
  error?: string;
}

let cached: NasHealth = {
  state: 'unknown',
  mediaRoot: '',
  checkedAt: new Date(0).toISOString(),
};

/**
 * Probe the configured mediaRoot:
 *   1. stat() — does it exist and is it a directory?
 *   2. write a tiny temp file then unlink — is it writable?
 *
 * Updates the module-level cache. Never throws.
 */
export async function checkNasHealth(config: AppConfig): Promise<NasHealth> {
  const log = getLogger();
  const checkedAt = new Date().toISOString();
  const mediaRoot = config.mediaRoot;

  let stats;
  try {
    stats = await stat(mediaRoot);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    cached = { state: 'missing', mediaRoot, checkedAt, error };
    log.warn({ mediaRoot, error }, 'NAS health: media root not accessible');
    return cached;
  }

  if (!stats.isDirectory()) {
    cached = { state: 'missing', mediaRoot, checkedAt, error: 'mediaRoot is not a directory' };
    log.warn({ mediaRoot }, 'NAS health: media root is not a directory');
    return cached;
  }

  // Probe writability with a short-lived dotfile so it does not appear in the walker.
  const probePath = join(mediaRoot, `.pm-write-probe-${randomBytes(8).toString('hex')}`);
  try {
    await writeFile(probePath, '');
    try {
      await unlink(probePath);
    } catch {
      // Best-effort cleanup; the probe file is harmless and walker ignores dotfiles.
    }
    cached = { state: 'rw', mediaRoot, checkedAt };
    return cached;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    cached = { state: 'ro', mediaRoot, checkedAt, error };
    log.warn({ mediaRoot, error }, 'NAS health: media root is not writable');
    return cached;
  }
}

/**
 * Return the most recent cached health state. Synchronous — call sites that need
 * up-to-the-second accuracy should call checkNasHealth() instead.
 */
export function getNasHealth(): NasHealth {
  return cached;
}
