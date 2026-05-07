import sharp from 'sharp';
import exifReader from 'exif-reader';
import type { ExifData } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

/**
 * Extracts EXIF metadata from an image file using sharp + exif-reader.
 * Returns null for files without EXIF data (never throws).
 */
export async function extractExif(filePath: string): Promise<ExifData> {
  const log = getLogger();

  const result: ExifData = {
    dateTaken: null,
    cameraMake: null,
    cameraModel: null,
    lens: null,
    gpsLat: null,
    gpsLng: null,
    orientation: null,
    width: null,
    height: null,
  };

  try {
    const metadata = await sharp(filePath).metadata();

    result.width = metadata.width ?? null;
    result.height = metadata.height ?? null;
    result.orientation = metadata.orientation ?? null;

    if (!metadata.exif) {
      return result;
    }

    const exif = exifReader(metadata.exif);

    // Date taken
    const dateOriginal = exif.Photo?.DateTimeOriginal ?? exif.Image?.DateTime;
    if (dateOriginal instanceof Date && !isNaN(dateOriginal.getTime())) {
      result.dateTaken = dateOriginal;
    }

    // Camera info
    result.cameraMake = stringOrNull(exif.Image?.Make);
    result.cameraModel = stringOrNull(exif.Image?.Model);
    result.lens = stringOrNull(exif.Photo?.LensModel);

    // GPS coordinates
    if (exif.GPSInfo) {
      const lat = exif.GPSInfo.GPSLatitude;
      const lng = exif.GPSInfo.GPSLongitude;

      if (typeof lat === 'number' && typeof lng === 'number') {
        result.gpsLat = lat;
        result.gpsLng = lng;
      }
    }
  } catch (err) {
    log.debug({ filePath, err }, 'Failed to extract EXIF data');
  }

  return result;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}
