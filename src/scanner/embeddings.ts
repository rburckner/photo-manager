import * as tf from '@tensorflow/tfjs';
import { createCanvas, loadImage } from 'canvas';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

let model: tf.GraphModel | null = null;
let embeddingRunning: boolean = false;
let embeddingCancelled: boolean = false;

// Wrap in a function so TypeScript's flow analysis doesn't narrow the value
// to its last-assigned literal — this flag IS mutated by a separate function
// (cancelEmbedding) at runtime.
function isCancelled(): boolean { return embeddingCancelled; }

// MobileNet v2 produces 1024-dim feature vectors

async function loadModel(): Promise<void> {
  if (model) return;
  const log = getLogger();
  log.info('Loading MobileNet model for image embeddings...');

  // Use MobileNet v2 from TF Hub via tfjs
  model = await tf.loadGraphModel(
    'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector/3/default/1',
    { fromTFHub: true },
  );

  log.info('MobileNet model loaded');
}

/**
 * Generate a feature vector embedding for a single image.
 */
async function embedImage(imagePath: string): Promise<Float32Array | null> {
  if (!model) return null;

  try {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(224, 224);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 224, 224);

    const imageData = ctx.getImageData(0, 0, 224, 224);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const tensor = tf.browser.fromPixels({
      data: new Uint8Array(imageData.data),
      width: 224,
      height: 224,
    } as any)
    /* eslint-enable */
      .toFloat()
      .div(255.0)
      .expandDims(0);

    const embedding = model.predict(tensor) as tf.Tensor;
    const data = await embedding.data();

    tensor.dispose();
    embedding.dispose();

    return new Float32Array(data);
  } catch {
    return null;
  }
}

/**
 * Run embedding generation on a batch of photos.
 */
export async function runEmbeddingScan(
  db: Database.Database,
  config: AppConfig,
  batchSize: number = 50,
): Promise<{ scanned: number; embedded: number; cancelled: boolean }> {
  const log = getLogger();

  if (embeddingRunning) {
    return { scanned: 0, embedded: 0, cancelled: false };
  }

  embeddingRunning = true;
  embeddingCancelled = false;

  await loadModel();
  if (!model) {
    embeddingRunning = false;
    return { scanned: 0, embedded: 0, cancelled: false };
  }

  let totalScanned = 0;
  let totalEmbedded = 0;

  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO image_embeddings (photo_id, embedding, model) VALUES (?, ?, ?)',
  );

  // Loop through batches until done or cancelled
  while (!isCancelled()) {
    const photoIds = (db.prepare(`
      SELECT p.id FROM photos p
      LEFT JOIN image_embeddings e ON e.photo_id = p.id
      WHERE e.photo_id IS NULL AND p.is_video = 0
      ORDER BY p.id DESC
      LIMIT ?
    `).all(batchSize) as Array<{ id: number }>).map((r) => r.id);

    if (photoIds.length === 0) break;

    let batchEmbedded = 0;

    for (const photoId of photoIds) {
      if (isCancelled()) break;

      const photo = db.prepare('SELECT thumbnail_path, file_path FROM photos WHERE id = ?')
        .get(photoId) as { thumbnail_path: string | null; file_path: string } | undefined;

      if (!photo) { totalScanned++; continue; }

      let imagePath: string;
      if (photo.thumbnail_path) {
        imagePath = join(config.thumbnailDir, photo.thumbnail_path);
      } else {
        imagePath = join(config.mediaRoot, photo.file_path);
      }

      if (!existsSync(imagePath)) { totalScanned++; continue; }

      const embedding = await embedImage(imagePath);
      if (embedding) {
        insertStmt.run(photoId, Buffer.from(embedding.buffer), 'mobilenet');
        batchEmbedded++;
        totalEmbedded++;
      }
      totalScanned++;

      // Yield every 10 photos so API stays responsive
      if (totalScanned % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    log.info({ batchEmbedded, totalScanned, totalEmbedded }, 'Embedding batch complete');

    if (batchEmbedded === 0) break;

    // Yield between batches
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  embeddingRunning = false;
  const cancelled = embeddingCancelled;
  embeddingCancelled = false;

  log.info({ totalScanned, totalEmbedded, cancelled }, 'Embedding scan complete');
  return { scanned: totalScanned, embedded: totalEmbedded, cancelled };
}

export function cancelEmbeddingScan(): boolean {
  if (embeddingRunning) {
    embeddingCancelled = true;
    return true;
  }
  return false;
}

export function isEmbeddingScanRunning(): boolean {
  return embeddingRunning;
}

/**
 * Find visually similar photos using cosine similarity on embeddings.
 */
export function findVisuallySimilar(
  db: Database.Database,
  photoId: number,
  limit: number = 50,
  threshold: number = 0.7,
): Array<{ photo_id: number; similarity: number }> {
  const source = db.prepare(
    'SELECT embedding FROM image_embeddings WHERE photo_id = ?',
  ).get(photoId) as { embedding: Buffer } | undefined;

  if (!source) return [];

  const sourceVec = new Float32Array(
    source.embedding.buffer,
    source.embedding.byteOffset,
    source.embedding.byteLength / 4,
  );

  // Get all embeddings (this is O(n) but fast for 120k float comparisons)
  const all = db.prepare(
    'SELECT photo_id, embedding FROM image_embeddings WHERE photo_id != ?',
  ).all(photoId) as Array<{ photo_id: number; embedding: Buffer }>;

  const results: Array<{ photo_id: number; similarity: number }> = [];

  for (const row of all) {
    const vec = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4,
    );

    const sim = cosineSimilarity(sourceVec, vec);
    if (sim >= threshold) {
      results.push({ photo_id: row.photo_id, similarity: sim });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
