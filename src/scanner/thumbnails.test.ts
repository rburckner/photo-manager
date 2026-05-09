import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateThumbnail } from './thumbnails.js';
import { initLogger } from '../shared/logger.js';

initLogger({ logLevel: 'error' });

async function makeTestPng(filePath: string, width = 200, height = 200): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  }).png().toFile(filePath);
}

describe('generateThumbnail (image path)', () => {
  let workDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pm-thumb-test-'));
    inputDir = join(workDir, 'input');
    outputDir = join(workDir, 'thumbs');
    rmSync(inputDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
    // The test factory creates them as needed
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('generates a JPEG thumbnail and returns the relative 2-level path', async () => {
    const inputPath = join(workDir, 'photo.png');
    await makeTestPng(inputPath, 800, 600);

    const result = await generateThumbnail(inputPath, 'abcdef1234', false, {
      size: 200,
      quality: 80,
      outputDir,
    });

    expect(result).toBe(join('ab', 'abcdef1234.jpg'));
    const thumbAbs = join(outputDir, 'ab', 'abcdef1234.jpg');
    expect(existsSync(thumbAbs)).toBe(true);

    // Confirm it actually decodes as a JPEG
    const meta = await sharp(thumbAbs).metadata();
    expect(meta.format).toBe('jpeg');
    // 800x600 → resize-fit-inside 200 → width=200, height=150
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('does not enlarge images smaller than the requested size', async () => {
    const inputPath = join(workDir, 'tiny.png');
    await makeTestPng(inputPath, 50, 50);

    await generateThumbnail(inputPath, 'tinyhash', false, {
      size: 200,
      quality: 80,
      outputDir,
    });

    const thumbAbs = join(outputDir, 'ti', 'tinyhash.jpg');
    const meta = await sharp(thumbAbs).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  it('returns the existing path without regenerating when the thumbnail already exists', async () => {
    const inputPath = join(workDir, 'photo.png');
    await makeTestPng(inputPath, 200, 200);

    const first = await generateThumbnail(inputPath, 'cachehash', false, {
      size: 200,
      quality: 80,
      outputDir,
    });
    expect(first).not.toBeNull();
    const thumbAbs = join(outputDir, 'ca', 'cachehash.jpg');
    const firstMtime = statSync(thumbAbs).mtimeMs;

    // Pause briefly so a regen would change mtime
    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await generateThumbnail(inputPath, 'cachehash', false, {
      size: 200,
      quality: 80,
      outputDir,
    });
    expect(second).toBe(first);
    expect(statSync(thumbAbs).mtimeMs).toBe(firstMtime);
  });

  it('returns null when the input file is missing or corrupt', async () => {
    const result = await generateThumbnail(
      join(workDir, 'nope.png'),
      'missing',
      false,
      { size: 200, quality: 80, outputDir },
    );

    expect(result).toBeNull();
    expect(existsSync(join(outputDir, 'mi', 'missing.jpg'))).toBe(false);
  });

  it('returns null on a corrupt image file', async () => {
    const inputPath = join(workDir, 'corrupt.png');
    writeFileSync(inputPath, 'this is not a real png');

    const result = await generateThumbnail(inputPath, 'corrupthash', false, {
      size: 200,
      quality: 80,
      outputDir,
    });

    expect(result).toBeNull();
  });

});
