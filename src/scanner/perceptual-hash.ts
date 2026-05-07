import sharp from 'sharp';

/**
 * Compute a 64-bit difference hash (dHash) for an image.
 *
 * Algorithm:
 *   1. Resize to 9x8 grayscale.
 *   2. For each row, compare each pixel to its right neighbor.
 *   3. The 8x8 = 64 comparisons form the bits of the hash.
 *
 * Visually similar images produce hashes with low Hamming distance.
 * dHash is robust to resize, mild compression, and brightness shifts.
 *
 * Returns the hash as a 16-character hex string (e.g. "a3b1f0e7d8c92a1b").
 * Returns null if the image can't be decoded.
 */
export async function computeDHash(filePath: string): Promise<string | null> {
  try {
    const buffer = await sharp(filePath)
      .resize(9, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    if (buffer.length !== 72) return null;

    // Walk the 9x8 buffer row by row, producing 8 bits per row.
    let hex = '';
    for (let row = 0; row < 8; row++) {
      let byte = 0;
      for (let col = 0; col < 8; col++) {
        const left = buffer[row * 9 + col];
        const right = buffer[row * 9 + col + 1];
        if (left === undefined || right === undefined) continue;
        if (left > right) byte |= 1 << (7 - col);
      }
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * Hamming distance between two equal-length hex hashes.
 * Distance ranges 0 (identical) to 64 (inverted).
 *
 * Practical similarity thresholds for dHash:
 *   ≤ 5: virtually identical (resize, mild recompress)
 *   6-10: visually similar (cropped, color-shifted)
 *   > 10: probably different scenes
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/**
 * Split a 64-bit hex hash into 8 chunks of 8 bits each (one byte / 2 hex chars).
 *
 * Pigeonhole principle for chunk-bucketing search: with k chunks, two hashes
 * within Hamming distance d ≤ (k-1) MUST share at least one chunk exactly.
 * With 8 chunks, that covers distances ≤ 7 — well above our default
 * "near-duplicate" threshold of ~5.
 */
export function chunkHash(hash: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < hash.length; i += 2) {
    chunks.push(hash.slice(i, i + 2));
  }
  return chunks;
}
