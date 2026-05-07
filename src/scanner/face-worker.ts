/**
 * Face detection worker — runs in a separate thread to avoid blocking the API.
 * Communicates via parentPort messages.
 */
import { parentPort, workerData } from 'node:worker_threads';
import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, createCanvas, loadImage } from 'canvas';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

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
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
  faceapi.env.monkeyPatch({
    Canvas: Canvas as any,
    Image: Image as any,
    ImageData: ImageData as any,
    createCanvasElement: () => createCanvas(1, 1) as any,
    createImageElement: () => new Image() as any,
  } as any);
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

async function detectFaces(req: DetectRequest): Promise<void> {
  let imagePath: string;
  if (req.thumbnailPath) {
    imagePath = join(config.thumbnailDir, req.thumbnailPath);
  } else {
    imagePath = join(config.mediaRoot, req.filePath);
  }

  if (!existsSync(imagePath)) {
    parentPort?.postMessage({ type: 'result', photoId: req.photoId, faces: [] } satisfies DetectResult);
    return;
  }

  try {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const detections = await faceapi
      .detectAllFaces(canvas as unknown as HTMLCanvasElement)
      .withFaceLandmarks()
      .withFaceDescriptors();

    const faces = detections.map((d) => ({
      embedding: Array.from(d.descriptor),
      x: d.detection.box.x / img.width,
      y: d.detection.box.y / img.height,
      width: d.detection.box.width / img.width,
      height: d.detection.box.height / img.height,
      confidence: d.detection.score,
    }));

    parentPort?.postMessage({ type: 'result', photoId: req.photoId, faces } satisfies DetectResult);
  } catch {
    parentPort?.postMessage({ type: 'result', photoId: req.photoId, faces: [] } satisfies DetectResult);
  }
}

parentPort?.on('message', (msg: DetectRequest) => {
  if (msg.type === 'detect') {
    void detectFaces(msg);
  }
});

void init();
