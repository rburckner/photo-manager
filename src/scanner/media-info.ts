import { extname } from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { MIME_MAP, SUPPORTED_VIDEO_EXTENSIONS } from '../shared/constants.js';
import type { MediaInfo } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

/**
 * Determines MIME type from file extension and probes video files
 * for duration and dimensions.
 */
export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? 'application/octet-stream';
  const isVideo = SUPPORTED_VIDEO_EXTENSIONS.has(ext);

  const result: MediaInfo = {
    mimeType,
    isVideo,
    width: null,
    height: null,
    duration: null,
  };

  if (isVideo) {
    try {
      const probe = await probeVideo(filePath);
      result.width = probe.width;
      result.height = probe.height;
      result.duration = probe.duration;
    } catch (err) {
      const log = getLogger();
      log.debug({ filePath, err }, 'Failed to probe video');
    }
  }

  return result;
}

interface VideoProbe {
  width: number | null;
  height: number | null;
  duration: number | null;
}

function probeVideo(filePath: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');

      resolve({
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null,
        duration: metadata.format.duration ?? null,
      });
    });
  });
}
