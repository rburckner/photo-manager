import { readdir, stat } from 'node:fs/promises';
import { join, relative, dirname, extname, basename } from 'node:path';
import { SUPPORTED_EXTENSIONS, SKIP_DIRECTORIES } from '../shared/constants.js';
import type { FileEntry } from '../shared/types.js';

export interface WalkOptions {
  rootPath: string;
  mediaRoot?: string; // Base path for relative path computation (defaults to rootPath)
  extensions?: Set<string>;
  skipDirs?: Set<string>;
}

/**
 * Recursively walks a directory tree, yielding FileEntry objects for
 * supported media files. Uses an async generator to keep memory flat
 * regardless of collection size.
 */
export async function* walkDirectory(options: WalkOptions): AsyncGenerator<FileEntry> {
  const {
    rootPath,
    mediaRoot = rootPath,
    extensions = SUPPORTED_EXTENSIONS,
    skipDirs = SKIP_DIRECTORIES,
  } = options;

  yield* walkRecursive(rootPath, mediaRoot, extensions, skipDirs);
}

async function* walkRecursive(
  currentPath: string,
  rootPath: string,
  extensions: Set<string>,
  skipDirs: Set<string>,
): AsyncGenerator<FileEntry> {
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch (err: unknown) {
    // Permission denied or broken symlink — skip silently
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EACCES' || error.code === 'ENOENT') {
      return;
    }
    throw err;
  }

  // Sort for deterministic ordering (important for resume)
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden directories and known system directories
      if (entry.name.startsWith('.') || skipDirs.has(entry.name)) {
        continue;
      }
      yield* walkRecursive(fullPath, rootPath, extensions, skipDirs);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!extensions.has(ext)) {
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }

      const relativePath = relative(rootPath, fullPath);
      const folderPath = dirname(relativePath);
      const fileName = basename(entry.name, ext);

      yield {
        absolutePath: fullPath,
        relativePath,
        folderPath: folderPath === '.' ? '' : folderPath,
        fileName,
        fileSize: fileStat.size,
        dateModified: fileStat.mtime,
      };
    }
  }
}

/**
 * Counts total files without loading them all into memory.
 */
export async function countFiles(options: WalkOptions): Promise<number> {
  let count = 0;
  for await (const _entry of walkDirectory(options)) {
    count++;
  }
  return count;
}
