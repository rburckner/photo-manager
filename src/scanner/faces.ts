import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, createCanvas, loadImage } from 'canvas';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { FaceRepository } from '../db/repositories/face.repository.js';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

let modelsLoaded = false;

/**
 * Load face-api.js models. Must be called once before detection.
 */
export async function loadFaceModels(modelsDir: string): Promise<void> {
  if (modelsLoaded) return;
  const log = getLogger();

  // Patch face-api to use node-canvas
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
  faceapi.env.monkeyPatch({
    Canvas: Canvas as any,
    Image: Image as any,
    ImageData: ImageData as any,
    createCanvasElement: () => createCanvas(1, 1) as any,
    createImageElement: () => new Image() as any,
  } as any);
  /* eslint-enable */

  if (!existsSync(modelsDir)) {
    log.warn({ modelsDir }, 'Face models directory not found — download models first');
    return;
  }

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsDir);

  modelsLoaded = true;
  log.info('Face detection models loaded');
}

/**
 * Detect faces in a single photo, extract embeddings, store in DB.
 */
export async function detectFacesInPhoto(
  photoId: number,
  photoRepo: PhotoRepository,
  faceRepo: FaceRepository,
  config: AppConfig,
): Promise<number> {
  const log = getLogger();

  if (!modelsLoaded) {
    log.warn('Face models not loaded — skipping detection');
    return 0;
  }

  if (faceRepo.isPhotoScanned(photoId)) return 0;

  const photo = photoRepo.findById(photoId);
  if (!photo || photo.is_video === 1) return 0;

  // Try thumbnail first (faster), fall back to original
  let imagePath: string;
  if (photo.thumbnail_path) {
    imagePath = join(config.thumbnailDir, photo.thumbnail_path);
  } else {
    imagePath = join(config.mediaRoot, photo.file_path);
  }

  if (!existsSync(imagePath)) return 0;

  try {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const detections = await faceapi
      .detectAllFaces(canvas as unknown as HTMLCanvasElement)
      .withFaceLandmarks()
      .withFaceDescriptors();

    for (const detection of detections) {
      const box = detection.detection.box;
      const embedding = Buffer.from(detection.descriptor.buffer);

      faceRepo.insertFace({
        photo_id: photoId,
        person_id: null,
        embedding,
        x: box.x / img.width,
        y: box.y / img.height,
        width: box.width / img.width,
        height: box.height / img.height,
        confidence: detection.detection.score,
      });
    }

    faceRepo.markPhotoScanned(photoId, detections.length);
    return detections.length;
  } catch (err) {
    log.debug({ photoId, err }, 'Face detection failed for photo');
    faceRepo.markPhotoScanned(photoId, 0);
    return 0;
  }
}

// Cancellation flag for face scans
let faceScanCancelled = false;
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
 * Run face detection on a batch of unscanned photos.
 */
export async function runFaceScan(
  photoRepo: PhotoRepository,
  faceRepo: FaceRepository,
  config: AppConfig,
  batchSize: number = 100,
  onProgress?: (current: number, total: number) => void,
): Promise<{ scanned: number; facesFound: number; cancelled: boolean }> {
  const log = getLogger();
  const modelsDir = join(config.thumbnailDir, '..', 'face-models');

  if (faceScanRunning) {
    log.warn('Face scan already running');
    return { scanned: 0, facesFound: 0, cancelled: false };
  }

  await loadFaceModels(modelsDir);
  if (!modelsLoaded) {
    log.warn('Cannot run face scan — models not loaded');
    return { scanned: 0, facesFound: 0, cancelled: false };
  }

  faceScanRunning = true;
  faceScanCancelled = false;

  const photoIds = faceRepo.getUnscannedPhotoIds(batchSize);
  let facesFound = 0;
  let scanned = 0;

  for (let i = 0; i < photoIds.length; i++) {
    if (faceScanCancelled) {
      log.info({ scanned, facesFound }, 'Face scan cancelled by user');
      break;
    }

    const id = photoIds[i]!;
    const count = await detectFacesInPhoto(id, photoRepo, faceRepo, config);
    facesFound += count;
    scanned++;
    onProgress?.(i + 1, photoIds.length);
  }

  faceScanRunning = false;
  const cancelled = faceScanCancelled;
  faceScanCancelled = false;

  log.info({ scanned, facesFound, cancelled }, 'Face scan batch complete');
  return { scanned, facesFound, cancelled };
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

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
