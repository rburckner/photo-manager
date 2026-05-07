import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getLogger } from '../shared/logger.js';

export interface ThumbnailOptions {
  size: number;
  quality: number;
  outputDir: string;
}

/**
 * Generates a JPEG thumbnail for an image or video file.
 * Returns the relative thumbnail path, or null on failure.
 *
 * Thumbnails are stored in a 2-level hash directory structure:
 *   {outputDir}/{hash[0:2]}/{hash}.jpg
 */
export async function generateThumbnail(
  filePath: string,
  fileHash: string,
  isVideo: boolean,
  options: ThumbnailOptions,
): Promise<string | null> {
  const log = getLogger();
  const subDir = fileHash.slice(0, 2);
  const thumbRelPath = join(subDir, `${fileHash}.jpg`);
  const thumbAbsPath = join(options.outputDir, thumbRelPath);

  // Skip if thumbnail already exists
  if (existsSync(thumbAbsPath)) {
    return thumbRelPath;
  }

  // Ensure directory exists
  mkdirSync(dirname(thumbAbsPath), { recursive: true });

  try {
    if (isVideo) {
      await generateVideoThumbnail(filePath, thumbAbsPath, options.size);
    } else {
      await generateImageThumbnail(filePath, thumbAbsPath, options.size, options.quality);
    }
    return thumbRelPath;
  } catch (err) {
    log.debug({ filePath, err }, 'Failed to generate thumbnail');
    return null;
  }
}

async function generateImageThumbnail(
  inputPath: string,
  outputPath: string,
  size: number,
  quality: number,
): Promise<void> {
  await sharp(inputPath)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toFile(outputPath);
}

function generateVideoThumbnail(
  inputPath: string,
  outputPath: string,
  size: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .on('end', () => { resolve(); })
      .on('error', (err) => { reject(err); })
      .screenshots({
        count: 1,
        timemarks: ['00:00:01'],
        size: `${size}x?`,
        folder: dirname(outputPath),
        filename: outputPath.split('/').pop(),
      });
  });
}
