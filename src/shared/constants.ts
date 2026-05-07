export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.tiff', '.tif',
  '.avif', '.bmp',
]);

export const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.mts', '.m2ts', '.webm', '.wmv',
]);

export const SUPPORTED_EXTENSIONS = new Set([
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
]);

export const SKIP_DIRECTORIES = new Set([
  '@eaDir', '#recycle', '.Trash', '@Recycle', 'node_modules', '.git',
  '.thumbnails', 'Thumbs.db',
]);

export const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv',
};

export const DEFAULT_THUMBNAIL_SIZES = {
  small: 200,
  medium: 600,
  large: 1200,
} as const;
