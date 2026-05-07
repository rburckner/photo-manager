import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { FaceRepository } from '../../db/repositories/face.repository.js';
import { PhotoRepository } from '../../db/repositories/photo.repository.js';
import type { AppConfig } from '../../shared/types.js';

export async function faceRoutes(
  app: FastifyInstance,
  opts: { faceRepo: FaceRepository; photoRepo: PhotoRepository; config: AppConfig },
): Promise<void> {
  const { faceRepo, photoRepo, config } = opts;

  // GET /api/people — list people (face clusters)
  app.get<{ Querystring: { include_ignored?: string } }>('/api/people', async (request) => {
    const includeIgnored = request.query.include_ignored === 'true';
    const people = faceRepo.listPeople(includeIgnored);

    // Add representative face thumbnail URL for each person
    return people.map((person) => {
      const face = faceRepo.getRepresentativeFace(person.id);
      return {
        ...person,
        representative_face_id: face?.id ?? null,
        representative_photo_id: face?.photo_id ?? null,
        face_box: face ? { x: face.x, y: face.y, width: face.width, height: face.height } : null,
      };
    });
  });

  // GET /api/people/unreviewed — people needing triage
  app.get('/api/people/unreviewed', async () => {
    const people = faceRepo.getUnreviewedPeople();
    return people.map((person) => {
      const face = faceRepo.getRepresentativeFace(person.id);
      return {
        ...person,
        representative_face_id: face?.id ?? null,
        representative_photo_id: face?.photo_id ?? null,
        face_box: face ? { x: face.x, y: face.y, width: face.width, height: face.height } : null,
      };
    });
  });

  // PUT /api/people/:id — update person (name, status)
  app.put<{
    Params: { id: string };
    Body: { name?: string; status?: string };
  }>('/api/people/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const person = faceRepo.getPerson(id);
    if (!person) {
      return reply.code(404).send({ error: 'Person not found' });
    }
    faceRepo.updatePerson(id, request.body);
    return faceRepo.getPerson(id);
  });

  // GET /api/people/:id/photos — photos containing this person
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string };
  }>('/api/people/:id/photos', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const person = faceRepo.getPerson(id);
    if (!person) {
      return reply.code(404).send({ error: 'Person not found' });
    }

    const limit = Math.min(200, parseInt(request.query.limit ?? '50', 10));
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const offset = (page - 1) * limit;

    const photoIds = faceRepo.getPhotoIdsByPerson(id);
    const total = photoIds.length;
    const pageIds = photoIds.slice(offset, offset + limit);
    const photos = pageIds.map((pid) => photoRepo.findById(pid)).filter(Boolean);

    return {
      photos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  // GET /api/photos/:id/faces — faces detected in a photo
  app.get<{ Params: { id: string } }>('/api/photos/:id/faces', async (request) => {
    const photoId = parseInt(request.params.id, 10);
    return faceRepo.getFacesByPhoto(photoId);
  });

  // POST /api/faces/scan — trigger face detection (non-blocking)
  app.post<{ Body: { batch_size?: number } }>('/api/faces/scan', async (request) => {
    const batchSize = request.body?.batch_size ?? 50;
    const { runFaceScanWorker, isFaceScanRunning } = await import('../../scanner/faces.js');
    if (isFaceScanRunning()) return { ok: true, message: 'Already running' };
    void runFaceScanWorker(photoRepo, faceRepo, config, batchSize);
    return { ok: true, message: 'Face scan started' };
  });

  // POST /api/faces/cancel — cancel a running face scan
  app.post('/api/faces/cancel', async () => {
    const { cancelFaceScan } = await import('../../scanner/faces.js');
    const cancelled = cancelFaceScan();
    return { ok: cancelled, message: cancelled ? 'Cancelling...' : 'No scan running' };
  });

  // GET /api/faces/status — check face scan progress
  app.get('/api/faces/status', async () => {
    const { isFaceScanRunning } = await import('../../scanner/faces.js');
    const totalPhotos = (faceRepo as unknown as { db: { prepare: (s: string) => { get: () => { c: number } } } }).db
      .prepare('SELECT count(*) as c FROM photos WHERE is_video = 0').get().c;
    const scannedCount = (faceRepo as unknown as { db: { prepare: (s: string) => { get: () => { c: number } } } }).db
      .prepare('SELECT count(*) as c FROM face_scan_status').get().c;
    const faceCount = (faceRepo as unknown as { db: { prepare: (s: string) => { get: () => { c: number } } } }).db
      .prepare('SELECT count(*) as c FROM faces').get().c;
    return { running: isFaceScanRunning(), total: totalPhotos, scanned: scannedCount, faces: faceCount, remaining: totalPhotos - scannedCount };
  });

  // POST /api/faces/cluster — run clustering on unassigned faces
  app.post('/api/faces/cluster', async () => {
    const { clusterFaces } = await import('../../scanner/faces.js');
    clusterFaces(faceRepo);
    return { ok: true };
  });

  // POST /api/people/merge — merge two people into one
  app.post<{ Body: { keep_id: number; merge_id: number } }>('/api/people/merge', async (request, reply) => {
    const { keep_id, merge_id } = request.body;
    if (!keep_id || !merge_id || keep_id === merge_id) {
      return reply.code(400).send({ error: 'keep_id and merge_id required and must differ' });
    }
    const keep = faceRepo.getPerson(keep_id);
    const merge = faceRepo.getPerson(merge_id);
    if (!keep || !merge) {
      return reply.code(404).send({ error: 'Person not found' });
    }
    faceRepo.mergePeople(keep_id, merge_id);
    return { ok: true, kept: keep_id, merged: merge_id };
  });

  // GET /api/faces/:faceId/crop — serve cropped face from thumbnail
  app.get<{ Params: { faceId: string } }>('/api/faces/:faceId/crop', async (request, reply) => {
    const faceId = parseInt(request.params.faceId, 10);
    const faceRow = faceRepo.getFaceById(faceId);

    if (!faceRow) {
      return reply.code(404).send({ error: 'Face not found' });
    }

    const photo = photoRepo.findById(faceRow.photo_id);
    if (!photo?.thumbnail_path) {
      return reply.code(404).send({ error: 'No thumbnail' });
    }

    const thumbPath = join(config.thumbnailDir, photo.thumbnail_path);
    if (!existsSync(thumbPath)) {
      return reply.code(404).send({ error: 'Thumbnail file missing' });
    }

    // Crop using sharp
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(thumbPath).metadata();
    const imgW = metadata.width ?? 400;
    const imgH = metadata.height ?? 400;

    // Face coords are normalized 0-1. Add generous padding around the face.
    const faceW = Math.round(faceRow.width * imgW);
    const faceH = Math.round(faceRow.height * imgH);
    const padX = Math.max(faceW, 40); // at least face-width padding on each side
    const padY = Math.max(faceH, 40);

    const left = Math.max(0, Math.round(faceRow.x * imgW) - padX);
    const top = Math.max(0, Math.round(faceRow.y * imgH) - padY);
    const right = Math.min(imgW, Math.round((faceRow.x + faceRow.width) * imgW) + padX);
    const bottom = Math.min(imgH, Math.round((faceRow.y + faceRow.height) * imgH) + padY);
    const width = right - left;
    const height = bottom - top;

    const cropped = await sharp(thumbPath)
      .extract({ left, top, width: Math.max(1, width), height: Math.max(1, height) })
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();

    return reply
      .type('image/jpeg')
      .header('Cache-Control', 'public, max-age=86400')
      .send(cropped);
  });
}
