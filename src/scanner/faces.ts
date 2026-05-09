import { join } from 'node:path';
import { FaceRepository } from '../db/repositories/face.repository.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

// Cancellation flag for face scans
let faceScanCancelled: boolean = false;
let faceScanRunning = false;

export function cancelFaceScan(): boolean {
  if (faceScanRunning) {
    faceScanCancelled = true;
    return true;
  }
  return false;
}

export function isFaceScanRunning(): boolean {
  return faceScanRunning;
}

/**
 * Simple DBSCAN clustering on face embeddings.
 * Groups faces by similarity (euclidean distance < threshold).
 */
export function clusterFaces(
  faceRepo: FaceRepository,
  distanceThreshold: number = 0.6,
): void {
  const log = getLogger();
  const allFaces = faceRepo.getAllEmbeddings();

  // Only cluster unassigned faces
  const unassigned = allFaces.filter((f) => f.person_id === null);
  if (unassigned.length === 0) return;

  const embeddings = unassigned.map((f) => ({
    id: f.id,
    vector: new Float32Array(f.embedding.buffer, f.embedding.byteOffset, f.embedding.byteLength / 4),
  }));

  // Simple greedy clustering
  const visited = new Set<number>();
  let clustersCreated = 0;

  for (let i = 0; i < embeddings.length; i++) {
    const face = embeddings[i]!;
    if (visited.has(face.id)) continue;

    // Find all faces within threshold distance
    const cluster: number[] = [face.id];
    visited.add(face.id);

    for (let j = i + 1; j < embeddings.length; j++) {
      const other = embeddings[j]!;
      if (visited.has(other.id)) continue;

      const dist = euclideanDistance(face.vector, other.vector);
      if (dist < distanceThreshold) {
        cluster.push(other.id);
        visited.add(other.id);
      }
    }

    // Create a person for clusters with 2+ faces
    if (cluster.length >= 2) {
      const personId = faceRepo.createPerson(null, 'unreviewed');
      faceRepo.assignFacesToPerson(cluster, personId);
      faceRepo.updatePersonPhotoCount(personId);
      clustersCreated++;
    }
  }

  log.info({ clustersCreated, unassignedProcessed: unassigned.length }, 'Face clustering complete');
}

/**
 * Run face detection in a worker thread so the API stays responsive while
 * @vladmandic/face-api (atop tfjs-node) does its CPU-heavy work. The worker
 * reads photos from disk, runs detection, and posts results back to be
 * persisted on the main thread.
 */
export async function runFaceScanWorker(
  photoRepo: PhotoRepository,
  faceRepo: FaceRepository,
  config: AppConfig,
  batchSize: number = 50,
  sweepAll: boolean = false,
): Promise<{ scanned: number; facesFound: number; cancelled: boolean }> {
  const log = getLogger();
  const { Worker } = await import('node:worker_threads');

  if (faceScanRunning) {
    return { scanned: 0, facesFound: 0, cancelled: false };
  }

  faceScanRunning = true;
  faceScanCancelled = false;

  let photoIds = faceRepo.getUnscannedPhotoIds(batchSize);
  if (photoIds.length === 0) {
    faceScanRunning = false;
    return { scanned: 0, facesFound: 0, cancelled: false };
  }

  const modelsDir = join(config.thumbnailDir, '..', 'face-models');
  // In dev (tsx watch) we run TypeScript directly, so the worker file is
  // face-worker.ts and Node needs the tsx loader registered. In production
  // (compiled) the worker is face-worker.js.
  const isDev = import.meta.url.endsWith('.ts');
  const workerPath = join(import.meta.dirname, isDev ? 'face-worker.ts' : 'face-worker.js');

  return new Promise((resolve) => {
    let scanned = 0;
    let facesFound = 0;
    let currentIdx = 0;

    const worker = new Worker(workerPath, {
      workerData: {
        modelsDir,
        thumbnailDir: config.thumbnailDir,
        mediaRoot: config.mediaRoot,
        dbPath: config.dbPath,
      },
      // Register tsx in dev so the worker can load the .ts file
      ...(isDev ? { execArgv: ['--import', 'tsx'] } : {}),
    });

    function shutdown(): void {
      worker.terminate().catch(() => {});
      faceScanRunning = false;
      const cancelled = faceScanCancelled;
      faceScanCancelled = false;
      log.info({ scanned, facesFound, cancelled, sweepAll }, 'Worker face scan complete');
      resolve({ scanned, facesFound, cancelled });
    }

    function sendNext(): void {
      if (faceScanCancelled) {
        shutdown();
        return;
      }

      // Current batch exhausted — either stop (drip mode) or refetch the next
      // batch and continue (sweep mode).
      if (currentIdx >= photoIds.length) {
        if (!sweepAll) {
          shutdown();
          return;
        }
        photoIds = faceRepo.getUnscannedPhotoIds(batchSize);
        currentIdx = 0;
        if (photoIds.length === 0) {
          shutdown();
          return;
        }
      }

      const id = photoIds[currentIdx]!;
      const photo = photoRepo.findById(id);
      if (!photo || photo.is_video === 1) {
        faceRepo.markPhotoScanned(id, 0);
        currentIdx++;
        scanned++;
        sendNext();
        return;
      }

      worker.postMessage({
        type: 'detect',
        photoId: id,
        thumbnailPath: photo.thumbnail_path,
        filePath: photo.file_path,
      });
    }

    worker.on('message', (msg: { type: string; photoId?: number; faces?: Array<{ embedding: number[]; x: number; y: number; width: number; height: number; confidence: number }> }) => {
      if (msg.type === 'ready') {
        sendNext();
      } else if (msg.type === 'result' && msg.photoId !== undefined) {
        const faces = msg.faces ?? [];
        for (const face of faces) {
          faceRepo.insertFace({
            photo_id: msg.photoId,
            person_id: null,
            embedding: Buffer.from(new Float32Array(face.embedding).buffer),
            x: face.x,
            y: face.y,
            width: face.width,
            height: face.height,
            confidence: face.confidence,
          });
        }
        faceRepo.markPhotoScanned(msg.photoId, faces.length);
        facesFound += faces.length;
        scanned++;
        currentIdx++;
        sendNext();
      } else if (msg.type === 'error') {
        log.warn('Face worker error — falling back to main thread');
        shutdown();
      }
    });

    worker.on('error', (err) => {
      log.warn({ error: err.message }, 'Face worker crashed');
      faceScanRunning = false;
      resolve({ scanned, facesFound, cancelled: false });
    });
  });
}

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
