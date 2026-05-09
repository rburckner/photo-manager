/**
 * Face detection worker — runs in a separate thread to avoid blocking the API.
 * Communicates via parentPort messages.
 *
 * IMPORTANT: @tensorflow/tfjs-node MUST be imported before @vladmandic/face-api
 * so that face-api binds to the native C++/libtensorflow backend instead of
 * falling back to the pure-JS runtime. The C++ backend is ~10× faster.
 *
 * We use @vladmandic/face-api (a maintained fork of face-api.js) because the
 * original face-api.js@0.22 is unmaintained and pinned to tfjs-core 1.x,
 * which is incompatible with @tensorflow/tfjs-node 4.x's bundled tfjs 4.
 */
import '@tensorflow/tfjs-node';
import { parentPort, workerData } from 'node:worker_threads';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, createCanvas } from 'canvas';
import sharp from 'sharp';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// HEIC fallback helpers inlined here rather than imported from
// `./heic-fallback.js` because the worker is loaded via Node's
// `worker_threads` (with the tsx loader in dev), and relative `.js`-with-
// `.ts`-on-disk imports don't reliably resolve in that worker context.
// Logic is intentionally identical to scanner/heic-fallback.ts.

function isHeicDecodeFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('No decoding plugin')
    || msg.includes('decoder for the compression format')
    || msg.includes('bad seek')
    || msg.includes('libheif')
    || /heif/i.test(msg);
}

async function decodeHeicViaWasm(filePath: string): Promise<{ data: Buffer; width: number; height: number; channels: 4 }> {
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

interface WorkerConfig {
  modelsDir: string;
  thumbnailDir: string;
  mediaRoot: string;
  dbPath: string;
}

interface DetectRequest {
  type: 'detect';
  photoId: number;
  thumbnailPath: string | null;
  filePath: string;
}

interface DetectResult {
  type: 'result';
  photoId: number;
  faces: Array<{
    embedding: number[];
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
}

interface StatusMessage {
  type: 'ready' | 'error';
  message?: string;
}

const config = workerData as WorkerConfig;

async function init(): Promise<void> {
  // Patch face-api for node-canvas
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
  faceapi.env.monkeyPatch({
    Canvas: Canvas as any,
    Image: Image as any,
    ImageData: ImageData as any,
    createCanvasElement: () => createCanvas(1, 1) as any,
    createImageElement: () => new Image() as any,
  });
  /* eslint-enable */

  if (!existsSync(config.modelsDir)) {
    parentPort?.postMessage({ type: 'error', message: 'Models directory not found' } satisfies StatusMessage);
    return;
  }

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(config.modelsDir);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(config.modelsDir);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(config.modelsDir);

  parentPort?.postMessage({ type: 'ready' } satisfies StatusMessage);
}

/**
 * Working resolution for face detection. SSD MobileNet handles 1024–1600 px
 * comfortably; embeddings are sharper than at the 400 px display thumb size.
 * Memory cost per image: ~5 MB peak (1280×960 RGBA), released after the scan.
 */
const FACE_WORK_SIZE = 1280;

async function detectFaces(req: DetectRequest): Promise<void> {
  // Prefer the original (full-res, sharp can decode HEIC/HEIF directly).
  // Fall back to the cached JPEG thumbnail only if the original is missing
  // or sharp fails on it (e.g., truly corrupt file).
  const originalPath = join(config.mediaRoot, req.filePath);
  const thumbPath = req.thumbnailPath ? join(config.thumbnailDir, req.thumbnailPath) : null;

  const candidates: string[] = [];
  if (existsSync(originalPath)) candidates.push(originalPath);
  if (thumbPath && existsSync(thumbPath)) candidates.push(thumbPath);

  if (candidates.length === 0) {
    parentPort?.postMessage({ type: 'result', photoId: req.photoId, faces: [] } satisfies DetectResult);
    return;
  }

  for (const path of candidates) {
    try {
      // Try sharp's native decode first (fastest). On HEIC HEVC decode
      // failure, fall back to heic-decode (WASM libheif) for the decode and
      // continue through sharp for resize/encode.
      let result;
      try {
        result = await sharp(path)
          .rotate() // honor EXIF orientation
          .resize(FACE_WORK_SIZE, FACE_WORK_SIZE, { fit: 'inside', withoutEnlargement: true })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
      } catch (sharpErr) {
        if (!isHeicDecodeFailure(sharpErr)) throw sharpErr;
        const decoded = await decodeHeicViaWasm(path);
        result = await sharp(decoded.data, {
          raw: { width: decoded.width, height: decoded.height, channels: decoded.channels },
        })
          .rotate()
          .resize(FACE_WORK_SIZE, FACE_WORK_SIZE, { fit: 'inside', withoutEnlargement: true })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
      }
      const { data, info } = result;

      const canvas = createCanvas(info.width, info.height);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(info.width, info.height);
      imageData.data.set(data);
      ctx.putImageData(imageData, 0, 0);

      const detections = await faceapi
        .detectAllFaces(canvas)
        .withFaceLandmarks()
        .withFaceDescriptors();

      const faces = detections.map((d) => ({
        embedding: Array.from(d.descriptor),
        // Box coords come back in pixels for the working canvas; normalize
        // to fractions so the DB stores resolution-independent positions.
        x: d.detection.box.x / info.width,
        y: d.detection.box.y / info.height,
        width: d.detection.box.width / info.width,
        height: d.detection.box.height / info.height,
        confidence: d.detection.score,
      }));

      parentPort?.postMessage({ type: 'result', photoId: req.photoId, faces } satisfies DetectResult);
      return;
    } catch {
      // try next candidate
    }
  }

  // Both attempts failed — return zero faces so the photo gets marked scanned.
  parentPort?.postMessage({ type: 'result', photoId: req.photoId, faces: [] } satisfies DetectResult);
}

parentPort?.on('message', (msg: DetectRequest) => {
  void detectFaces(msg);
});

void init();
