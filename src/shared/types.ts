// ── Database row types (match SQLite schema exactly) ──

export interface PhotoRow {
  id: number;
  file_path: string;
  file_name: string;
  file_hash: string;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  date_taken: string | null;
  date_modified: string;
  camera_make: string | null;
  camera_model: string | null;
  lens: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  orientation: number | null;
  is_video: number;
  is_favorite: number;
  thumbnail_path: string | null;
  folder_path: string;
  scanned_at: string;
  created_at: string;
  deleted_at: string | null;
  trash_path: string | null;
  original_path: string | null;
  perceptual_hash: string | null;
}

export interface PhotoInsert {
  file_path: string;
  file_name: string;
  file_hash: string;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  date_taken: string | null;
  date_modified: string;
  camera_make: string | null;
  camera_model: string | null;
  lens: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  orientation: number | null;
  is_video: number;
  is_favorite: number;
  thumbnail_path: string | null;
  folder_path: string;
  perceptual_hash: string | null;
}

export interface AlbumRow {
  id: number;
  name: string;
  description: string | null;
  cover_photo_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: number;
  name: string;
  color: string | null;
}

export interface ScanProgressRow {
  id: number;
  root_path: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_files: number;
  processed_files: number;
  skipped_files: number;
  error_count: number;
  last_file_path: string | null;
  started_at: string;
  completed_at: string | null;
  error_log: string | null;
}

// ── Scanner types ──

export interface FileEntry {
  absolutePath: string;
  relativePath: string;
  folderPath: string;
  fileName: string;
  fileSize: number;
  dateModified: Date;
}

export interface ExifData {
  dateTaken: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  orientation: number | null;
  width: number | null;
  height: number | null;
}

export interface MediaInfo {
  mimeType: string;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface ScanResult {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  errorCount: number;
  durationMs: number;
}

export interface ScanConfig {
  rootPath: string;
  mediaRoot: string;
  thumbnailDir: string;
  generateThumbnails: boolean;
  concurrency: number;
  batchSize: number;
  force: boolean;
  dryRun: boolean;
}

export interface ScanCallbacks {
  onProgress: (current: number, total: number, filePath: string) => void;
  onError: (filePath: string, error: Error) => void;
  onComplete: (result: ScanResult) => void;
}

// ── Config types ──

export interface AppConfig {
  mediaRoot: string;
  dbPath: string;
  thumbnailDir: string;
  dropboxDir: string;
  serverPort: number;
  serverHost: string;
  scanConcurrency: number;
  scanBatchSize: number;
  thumbnailSize: number;
  thumbnailQuality: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
