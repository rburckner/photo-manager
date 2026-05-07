import { describe, it, expect } from 'vitest';
import { hammingDistance, chunkHash } from './perceptual-hash.js';
import { findNearDuplicateClusters } from './find-near-duplicates.js';

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('a3b1f0e7d8c92a1b', 'a3b1f0e7d8c92a1b')).toBe(0);
  });

  it('returns 1 for hashes differing by a single bit', () => {
    // 0xa3 = 10100011, 0xa2 = 10100010 — differ in 1 bit
    expect(hammingDistance('a3b1f0e7d8c92a1b', 'a2b1f0e7d8c92a1b')).toBe(1);
  });

  it('returns 4 for hashes differing in one full hex digit (4 bits)', () => {
    // 0xa = 1010, 0x5 = 0101 — all 4 bits flipped
    expect(hammingDistance('a000000000000000', '5000000000000000')).toBe(4);
  });

  it('returns 64 for fully inverted hashes', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('returns MAX_SAFE_INTEGER for length mismatch', () => {
    expect(hammingDistance('abc', 'abcdef')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('chunkHash', () => {
  it('splits a 16-character hash into 8 byte-chunks', () => {
    const chunks = chunkHash('a3b1f0e7d8c92a1b');
    expect(chunks).toEqual(['a3', 'b1', 'f0', 'e7', 'd8', 'c9', '2a', '1b']);
  });
});

describe('findNearDuplicateClusters', () => {
  it('groups two near-identical hashes into one cluster', () => {
    const clusters = findNearDuplicateClusters(
      [
        { id: 1, perceptual_hash: 'a3b1f0e7d8c92a1b' },
        { id: 2, perceptual_hash: 'a3b1f0e7d8c92a1a' }, // 1 bit different
      ],
      5,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.photo_ids.sort()).toEqual([1, 2]);
  });

  it('keeps unrelated hashes apart', () => {
    const clusters = findNearDuplicateClusters(
      [
        { id: 1, perceptual_hash: '0000000000000000' },
        { id: 2, perceptual_hash: 'ffffffffffffffff' },
      ],
      5,
    );
    expect(clusters).toHaveLength(0);
  });

  it('chains transitively-similar photos into a single cluster', () => {
    // a -- 1 bit -- b -- 1 bit -- c, but a and c differ by 2 bits.
    // With distance threshold 1, all three should still merge transitively.
    const clusters = findNearDuplicateClusters(
      [
        { id: 1, perceptual_hash: '0000000000000000' },
        { id: 2, perceptual_hash: '0000000000000001' }, // 1 bit from id 1
        { id: 3, perceptual_hash: '0000000000000003' }, // 1 bit from id 2
      ],
      1,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.photo_ids.sort()).toEqual([1, 2, 3]);
  });

  it('uses the lowest id as the cluster representative', () => {
    const clusters = findNearDuplicateClusters(
      [
        { id: 17, perceptual_hash: '0000000000000000' },
        { id: 5, perceptual_hash: '0000000000000001' },
        { id: 99, perceptual_hash: '0000000000000003' },
      ],
      2,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.representative_id).toBe(5);
  });

  it('drops singletons (clusters of just one photo)', () => {
    const clusters = findNearDuplicateClusters(
      [
        { id: 1, perceptual_hash: '0000000000000000' },
        { id: 2, perceptual_hash: 'ffffffffffffffff' }, // far from id 1
        { id: 3, perceptual_hash: '0000000000000001' }, // near id 1
      ],
      2,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.photo_ids.sort()).toEqual([1, 3]);
  });

  it('returns empty when input is empty', () => {
    expect(findNearDuplicateClusters([], 5)).toEqual([]);
  });

  it('caps maxDistance at 7 (pigeonhole limit for 8 chunks)', () => {
    // Even if user passes 100, behavior should match distance 7.
    const a = '0000000000000000';
    const b = '0000000000000007'; // distance 3
    const clusters = findNearDuplicateClusters(
      [{ id: 1, perceptual_hash: a }, { id: 2, perceptual_hash: b }],
      100,
    );
    expect(clusters).toHaveLength(1);
  });

  it('sorts clusters by size (largest first)', () => {
    const clusters = findNearDuplicateClusters(
      [
        // Group A: 2 photos
        { id: 10, perceptual_hash: 'aaaaaaaaaaaaaaaa' },
        { id: 11, perceptual_hash: 'aaaaaaaaaaaaaaab' },
        // Group B: 3 photos
        { id: 20, perceptual_hash: '1111111111111111' },
        { id: 21, perceptual_hash: '1111111111111110' },
        { id: 22, perceptual_hash: '1111111111111113' },
      ],
      2,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.photo_ids.length).toBe(3);
    expect(clusters[1]?.photo_ids.length).toBe(2);
  });
});
