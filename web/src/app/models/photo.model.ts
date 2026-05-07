export interface Photo {
  id: number;
  file_name: string;
  file_path: string;
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
}

export interface TimelineGroup {
  date: string;
  count: number;
  photos: PhotoSummary[];
}

export interface PhotoSummary {
  id: number;
  file_name: string;
  file_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  date_taken: string | null;
  is_video: number;
  thumbnail_path: string | null;
}

export interface TimelineResponse {
  groups: TimelineGroup[];
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  photos: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CollectionStats {
  total: number;
  images: number;
  videos: number;
  totalSize: number;
  earliestDate: string | null;
  latestDate: string | null;
}
