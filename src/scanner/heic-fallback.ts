import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

/**
 * Decode an HEIC/HEIF file to raw RGBA pixels using heic-decode (a WASM
 * libheif port). Used as a fallback when sharp can't decode the file
 * because its prebuilt libheif lacks an HEVC decoder plugin.
 *
 * Per-decode cost on amd64 is ~200-500ms for a typical iPhone HEIC; ARM
 * is roughly 2-3x slower. Only invoked on the slow path (sharp's native
 * decode failure), so this stays out of the hot path for non-HEIC files.
 */
export interface DecodedImage {
  data: Buffer;
  width: number;
  height: number;
  channels: 4;
}

export async function decodeHeicToRaw(filePath: string): Promise<DecodedImage> {
  const buffer = await readFile(filePath);
  const heicDecode = (await import('heic-decode')).default;
  const result = await heicDecode({ buffer });
  return {
    data: Buffer.from(result.data),
    width: result.width,
    height: result.height,
    channels: 4,
  };
}

/**
 * Build a sharp pipeline starting from a decoded HEIC's raw pixel buffer.
 * Returned sharp instance behaves identically to `sharp(filePath)` for any
 * downstream operation (resize, jpeg, rotate, etc.).
 */
export function sharpFromDecoded(decoded: DecodedImage): sharp.Sharp {
  return sharp(decoded.data, {
    raw: { width: decoded.width, height: decoded.height, channels: decoded.channels },
  });
}

/**
 * Heuristic: did this error come from libheif's missing-decoder path?
 * Used to decide whether to attempt the heic-decode fallback. Other sharp
 * errors (corrupt file, unsupported format, etc.) bubble up unchanged.
 */
export function isHeicDecodeFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('No decoding plugin')
    || msg.includes('decoder for the compression format')
    || msg.includes('bad seek')
    || msg.includes('libheif')
    || /heif/i.test(msg);
}
