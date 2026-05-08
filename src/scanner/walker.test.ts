import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkDirectory, countFiles } from './walker.js';
import type { FileEntry } from '../shared/types.js';

async function collect(rootPath: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for await (const e of walkDirectory({ rootPath })) entries.push(e);
  return entries;
}

describe('walkDirectory', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pm-walker-test-'));
  });

  afterEach(() => {
    // Re-grant perms in case a test chmod'd a dir
    try { chmodSync(workDir, 0o755); } catch { /* ignore */ }
    rmSync(workDir, { recursive: true, force: true });
  });

  it('skips dot-prefixed directories (.trash, .git, .config)', async () => {
    mkdirSync(join(workDir, '.trash'), { recursive: true });
    mkdirSync(join(workDir, '.git'), { recursive: true });
    mkdirSync(join(workDir, '.config'), { recursive: true });
    mkdirSync(join(workDir, 'visible'), { recursive: true });

    writeFileSync(join(workDir, '.trash', 'trashed.jpg'), 'x');
    writeFileSync(join(workDir, '.git', 'gitfile.jpg'), 'x');
    writeFileSync(join(workDir, '.config', 'cfg.jpg'), 'x');
    writeFileSync(join(workDir, 'visible', 'photo.jpg'), 'x');

    const entries = await collect(workDir);
    const paths = entries.map((e) => e.relativePath);

    expect(paths).toEqual(['visible/photo.jpg']);
  });

  it('skips well-known system directories from SKIP_DIRECTORIES', async () => {
    mkdirSync(join(workDir, '@eaDir'), { recursive: true });
    mkdirSync(join(workDir, 'node_modules'), { recursive: true });
    mkdirSync(join(workDir, 'photos'), { recursive: true });

    writeFileSync(join(workDir, '@eaDir', 'a.jpg'), 'x');
    writeFileSync(join(workDir, 'node_modules', 'b.jpg'), 'x');
    writeFileSync(join(workDir, 'photos', 'c.jpg'), 'x');

    const entries = await collect(workDir);
    const paths = entries.map((e) => e.relativePath);

    expect(paths).toEqual(['photos/c.jpg']);
  });

  it('only emits files with supported extensions (case-insensitive)', async () => {
    writeFileSync(join(workDir, 'photo.jpg'), 'x');
    writeFileSync(join(workDir, 'photo.JPEG'), 'x'); // uppercase ok
    writeFileSync(join(workDir, 'movie.MP4'), 'x');
    writeFileSync(join(workDir, 'note.txt'), 'x');
    writeFileSync(join(workDir, 'doc.pdf'), 'x');
    writeFileSync(join(workDir, 'meta.json'), 'x');
    writeFileSync(join(workDir, 'no-extension'), 'x');

    const entries = await collect(workDir);
    const names = entries.map((e) => e.relativePath).sort();

    expect(names).toEqual(['movie.MP4', 'photo.JPEG', 'photo.jpg']);
  });

  it('returns entries in deterministic (sorted) order', async () => {
    writeFileSync(join(workDir, 'c.jpg'), 'x');
    writeFileSync(join(workDir, 'a.jpg'), 'x');
    writeFileSync(join(workDir, 'b.jpg'), 'x');
    mkdirSync(join(workDir, 'sub'), { recursive: true });
    writeFileSync(join(workDir, 'sub', 'z.jpg'), 'x');
    writeFileSync(join(workDir, 'sub', 'm.jpg'), 'x');

    const entries = await collect(workDir);
    const paths = entries.map((e) => e.relativePath);

    // Files sorted within directory; subdirs traversed last (after siblings starting with letters > 's' — but here no such)
    expect(paths).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'sub/m.jpg', 'sub/z.jpg']);
  });

  it('captures fileSize and dateModified accurately', async () => {
    const filePath = join(workDir, 'photo.jpg');
    writeFileSync(filePath, 'hello world'); // 11 bytes

    const [entry] = await collect(workDir);

    expect(entry).toBeDefined();
    expect(entry!.fileSize).toBe(11);
    expect(entry!.dateModified).toBeInstanceOf(Date);
    expect(entry!.fileName).toBe('photo');
    expect(entry!.absolutePath).toBe(filePath);
    expect(entry!.folderPath).toBe('');
  });

  it('reports correct folderPath for nested files', async () => {
    mkdirSync(join(workDir, '2024', 'event'), { recursive: true });
    writeFileSync(join(workDir, '2024', 'event', 'photo.jpg'), 'x');

    const [entry] = await collect(workDir);

    expect(entry).toBeDefined();
    expect(entry!.relativePath).toBe('2024/event/photo.jpg');
    expect(entry!.folderPath).toBe('2024/event');
    expect(entry!.fileName).toBe('photo');
  });

  it('returns empty when rootPath does not exist (no throw)', async () => {
    const missing = join(workDir, 'does-not-exist');
    const entries = await collect(missing);
    expect(entries).toEqual([]);
  });

  it('tolerates EACCES on a subdirectory and continues with siblings', async () => {
    mkdirSync(join(workDir, 'readable'), { recursive: true });
    mkdirSync(join(workDir, 'locked'), { recursive: true });
    writeFileSync(join(workDir, 'readable', 'ok.jpg'), 'x');
    writeFileSync(join(workDir, 'locked', 'denied.jpg'), 'x');

    // Strip read+execute perms on the locked directory
    chmodSync(join(workDir, 'locked'), 0o000);

    try {
      const entries = await collect(workDir);
      const paths = entries.map((e) => e.relativePath);
      // The readable file still comes through; the locked one is skipped silently
      expect(paths).toContain('readable/ok.jpg');
      expect(paths).not.toContain('locked/denied.jpg');
    } finally {
      // Restore for cleanup
      chmodSync(join(workDir, 'locked'), 0o755);
    }
  });

  it('countFiles returns the same count as walkDirectory', async () => {
    mkdirSync(join(workDir, 'sub'), { recursive: true });
    writeFileSync(join(workDir, 'a.jpg'), 'x');
    writeFileSync(join(workDir, 'b.png'), 'x');
    writeFileSync(join(workDir, 'sub', 'c.mp4'), 'x');
    writeFileSync(join(workDir, 'ignored.txt'), 'x');

    const count = await countFiles({ rootPath: workDir });
    const entries = await collect(workDir);

    expect(count).toBe(3);
    expect(entries.length).toBe(3);
  });
});
