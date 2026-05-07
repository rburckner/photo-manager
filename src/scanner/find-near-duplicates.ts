import { chunkHash, hammingDistance } from './perceptual-hash.js';

export interface NearDuplicateCluster {
  /** Lowest photo id in the cluster — used as the cluster's stable identifier. */
  representative_id: number;
  /** All photo ids in the cluster (including representative). */
  photo_ids: number[];
}

/**
 * Find clusters of visually-similar photos by Hamming distance over their
 * 64-bit dHashes.
 *
 * Algorithm:
 *   1. Bucket each photo's hash by every chunk position. Two hashes within
 *      Hamming distance ≤ 7 must share at least one chunk exactly (pigeonhole
 *      with 8 chunks of 8 bits each).
 *   2. For each photo, the candidate set = union of bucket-mates across all
 *      chunk positions. Compute true Hamming distance for each candidate;
 *      keep pairs ≤ maxDistance.
 *   3. Union-find merges related pairs into clusters.
 *
 * Complexity: O(N * average_bucket_size). With well-distributed hashes that
 * is roughly linear; with degenerate near-identical libraries it can hit O(N²)
 * but only within actually-similar groups.
 */
export function findNearDuplicateClusters(
  hashes: Array<{ id: number; perceptual_hash: string }>,
  maxDistance: number,
): NearDuplicateCluster[] {
  if (maxDistance > 7) {
    // Pigeonhole only guarantees coverage up to distance 7. Higher thresholds
    // would silently miss matches; cap to keep semantics honest.
    maxDistance = 7;
  }

  // 1. Build chunk index: position (0..7) -> chunkValue -> ids[]
  const chunkBuckets: Array<Map<string, number[]>> = Array.from(
    { length: 8 },
    () => new Map<string, number[]>(),
  );
  for (const photo of hashes) {
    const chunks = chunkHash(photo.perceptual_hash);
    for (let i = 0; i < 8; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const bucket = chunkBuckets[i];
      if (!bucket) continue;
      const list = bucket.get(chunk) ?? [];
      list.push(photo.id);
      bucket.set(chunk, list);
    }
  }

  // 2. Union-Find for clustering
  const parent = new Map<number, number>();
  for (const p of hashes) parent.set(p.id, p.id);

  function find(x: number): number {
    let r = x;
    let p = parent.get(r);
    while (p !== undefined && p !== r) {
      r = p;
      p = parent.get(r);
    }
    return r;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      // Always make the smaller id the root so cluster representative is stable.
      if (ra < rb) parent.set(rb, ra);
      else parent.set(ra, rb);
    }
  }

  // 3. For each photo, gather candidates via chunk match and union close pairs.
  const hashById = new Map(hashes.map((p) => [p.id, p.perceptual_hash]));
  for (const photo of hashes) {
    const myChunks = chunkHash(photo.perceptual_hash);
    const candidates = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const chunk = myChunks[i];
      if (!chunk) continue;
      const bucket = chunkBuckets[i]?.get(chunk);
      if (!bucket) continue;
      for (const id of bucket) {
        if (id !== photo.id) candidates.add(id);
      }
    }
    for (const candId of candidates) {
      // Each pair will be visited twice (once from each side) — only do work
      // when our id is lower, halving the comparison count.
      if (candId < photo.id) continue;
      const candHash = hashById.get(candId);
      if (!candHash) continue;
      if (hammingDistance(photo.perceptual_hash, candHash) <= maxDistance) {
        union(photo.id, candId);
      }
    }
  }

  // 4. Group by root, drop singletons.
  const groups = new Map<number, number[]>();
  for (const photo of hashes) {
    const root = find(photo.id);
    const list = groups.get(root) ?? [];
    list.push(photo.id);
    groups.set(root, list);
  }

  const clusters: NearDuplicateCluster[] = [];
  for (const [root, ids] of groups) {
    if (ids.length < 2) continue;
    ids.sort((a, b) => a - b);
    clusters.push({ representative_id: root, photo_ids: ids });
  }
  // Largest clusters first
  clusters.sort((a, b) => b.photo_ids.length - a.photo_ids.length);
  return clusters;
}
