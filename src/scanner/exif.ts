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
      const rawLat = exif.GPSInfo.GPSLatitude;
      const rawLng = exif.GPSInfo.GPSLongitude;
      const latRef = exif.GPSInfo.GPSLatitudeRef;
      const lngRef = exif.GPSInfo.GPSLongitudeRef;

      const lat = parseGpsCoord(rawLat, latRef);
      const lng = parseGpsCoord(rawLng, lngRef);

      if (lat !== null && lng !== null) {
        result.gpsLat = lat;
        result.gpsLng = lng;
      }
    }
  } catch (err) {
    log.debug({ filePath, err }, 'Failed to extract EXIF data');
  }

  return result;
}

/**
 * Parse GPS coordinate from EXIF data.
 * Handles all known formats:
 *   - Decimal degrees: number (e.g., 38.6876)
 *   - DMS array: [degrees, minutes, seconds] (e.g., [38, 41, 15.37])
 *   - DM array: [degrees, minutes] (e.g., [38, 41.256])
 *   - Rational array: [{numerator, denominator}, ...] (some EXIF libs)
 *   - String: "38 41 15.37 N" or "38.6876"
 */
function parseGpsCoord(raw: unknown, ref?: string): number | null {
  let decimal: number | null = null;

  if (typeof raw === 'number' && isFinite(raw)) {
    decimal = raw;
  } else if (Array.isArray(raw)) {
    if (raw.length >= 3) {
      // DMS: [degrees, minutes, seconds]
      const deg = toNumber(raw[0]);
      const min = toNumber(raw[1]);
      const sec = toNumber(raw[2]);
      if (deg !== null && min !== null && sec !== null) {
        decimal = deg + min / 60 + sec / 3600;
      }
    } else if (raw.length === 2) {
      // DM: [degrees, minutes] (minutes may include fractional)
      const deg = toNumber(raw[0]);
      const min = toNumber(raw[1]);
      if (deg !== null && min !== null) {
        decimal = deg + min / 60;
      }
    } else if (raw.length === 1) {
      decimal = toNumber(raw[0]);
    }
  } else if (typeof raw === 'string') {
    // Try parsing "38 41 15.37 N" or just "38.6876"
    const parts = raw.trim().split(/[\s,°'"]+/).filter(Boolean);
    if (parts.length >= 3) {
      const deg = parseFloat(parts[0] ?? '');
      const min = parseFloat(parts[1] ?? '');
      const sec = parseFloat(parts[2] ?? '');
      if (!isNaN(deg) && !isNaN(min) && !isNaN(sec)) {
        decimal = deg + min / 60 + sec / 3600;
      }
      // Check if last part is a hemisphere ref
      const lastPart = parts[parts.length - 1]?.toUpperCase();
      if (lastPart === 'S' || lastPart === 'W') {
        decimal = decimal !== null ? -Math.abs(decimal) : null;
        return decimal; // Already applied sign
      }
    } else {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) decimal = parsed;
    }
  }

  if (decimal === null || !isFinite(decimal)) return null;

  // Sanity check — coordinates must be in valid range
  if (Math.abs(decimal) > 180) return null;

  // Apply hemisphere — S and W are negative
  if (ref === 'S' || ref === 'W') {
    decimal = -Math.abs(decimal);
  }

  return decimal;
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number' && isFinite(val)) return val;
  // Rational format: {numerator, denominator}
  if (val && typeof val === 'object' && 'numerator' in val && 'denominator' in val) {
    const r = val as { numerator: number; denominator: number };
    if (r.denominator !== 0) return r.numerator / r.denominator;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}
