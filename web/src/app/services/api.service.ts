import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Photo, TimelineResponse, CollectionStats, PaginatedResponse, FolderEntry, Album, MapPoint, SlideshowPhoto, PersonSummary } from '../models/photo.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  getTimeline(page: number = 0, limit: number = 100, after?: string, before?: string): Observable<TimelineResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (after) params = params.set('after', after);
    if (before) params = params.set('before', before);
    return this.http.get<TimelineResponse>(`${this.baseUrl}/photos/timeline`, { params });
  }

  getPhoto(id: number): Observable<Photo> {
    return this.http.get<Photo>(`${this.baseUrl}/photos/${id}`);
  }

  getStats(): Observable<CollectionStats> {
    return this.http.get<CollectionStats>(`${this.baseUrl}/stats`);
  }

  getFolders(): Observable<FolderEntry[]> {
    return this.http.get<FolderEntry[]>(`${this.baseUrl}/photos/folders`);
  }

  getPhotos(page: number = 1, limit: number = 50, folder?: string, sort?: string, order?: 'asc' | 'desc'): Observable<PaginatedResponse<Photo>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (folder) {
      params = params.set('folder', folder);
    }
    if (sort) {
      params = params.set('sort', sort);
    }
    if (order) {
      params = params.set('order', order);
    }
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/photos`, { params });
  }

  // Albums
  getAlbums(): Observable<Album[]> {
    return this.http.get<Album[]>(`${this.baseUrl}/albums`);
  }

  createAlbum(name: string, description?: string): Observable<Album> {
    return this.http.post<Album>(`${this.baseUrl}/albums`, { name, description });
  }

  updateAlbum(id: number, data: { name?: string; description?: string; cover_photo_id?: number | null }): Observable<Album> {
    return this.http.put<Album>(`${this.baseUrl}/albums/${id}`, data);
  }

  deleteAlbum(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/albums/${id}`);
  }

  getAlbumPhotos(albumId: number, page: number = 1, limit: number = 100): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/albums/${albumId}/photos`, { params });
  }

  addPhotosToAlbum(albumId: number, photoIds: number[]): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/albums/${albumId}/photos`, { photo_ids: photoIds });
  }

  removePhotosFromAlbum(albumId: number, photoIds: number[]): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/albums/${albumId}/photos`, { body: { photo_ids: photoIds } });
  }

  // Favorites
  getBadDatePhotos(limit: number = 200): Observable<Photo[]> {
    return this.http.get<Photo[]>(`${this.baseUrl}/photos/bad-dates`, { params: { limit: limit.toString() } });
  }

  rescanGps(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/rescan-gps`, {});
  }

  getGpsScanStatus(): Observable<{ running: boolean; withGps: number; withoutGps: number; checked: number; found: number; total: number }> {
    return this.http.get<{ running: boolean; withGps: number; withoutGps: number; checked: number; found: number; total: number }>(`${this.baseUrl}/photos/rescan-gps/status`);
  }

  cancelGpsScan(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/rescan-gps/cancel`, {});
  }

  findVisuallySimilar(id: number, limit: number = 30): Observable<Array<Photo & { similarity: number }>> {
    return this.http.get<Array<Photo & { similarity: number }>>(`${this.baseUrl}/photos/${id}/visually-similar`, { params: { limit: limit.toString() } });
  }

  runEmbeddingScan(batchSize: number = 50): Observable<{ scanned: number; embedded: number }> {
    return this.http.post<{ scanned: number; embedded: number }>(`${this.baseUrl}/embeddings/scan`, { batch_size: batchSize });
  }

  getEmbeddingStatus(): Observable<{ running: boolean; total: number; embedded: number; remaining: number }> {
    return this.http.get<{ running: boolean; total: number; embedded: number; remaining: number }>(`${this.baseUrl}/embeddings/status`);
  }

  cancelEmbeddingScan(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/embeddings/cancel`, {});
  }

  rotatePhoto(id: number, degrees: number = 90): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/${id}/rotate`, { degrees });
  }

  findSimilar(id: number): Observable<{ sameDay: Photo[]; samePerson: Photo[] }> {
    return this.http.get<{ sameDay: Photo[]; samePerson: Photo[] }>(`${this.baseUrl}/photos/${id}/similar`);
  }

  bulkHide(ids: number[], hidden: boolean): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/bulk/hide`, { photo_ids: ids, hidden });
  }

  getHiddenPhotos(page: number = 1, limit: number = 50): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/photos/hidden`, { params });
  }

  bulkSetDate(ids: number[], date: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/bulk/set-date`, { photo_ids: ids, date });
  }

  bulkFavorite(ids: number[], value: boolean): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/bulk/favorite`, { photo_ids: ids, value });
  }

  toggleFavorite(id: number): Observable<{ id: number; is_favorite: boolean }> {
    return this.http.post<{ id: number; is_favorite: boolean }>(`${this.baseUrl}/photos/${id}/favorite`, {});
  }

  getFavorites(page: number = 1, limit: number = 50): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/photos/favorites`, { params });
  }

  // Trash
  bulkTrash(ids: number[]): Observable<{ moved: number; errors: Array<{ id: number; error: string }> }> {
    return this.http.post<{ moved: number; errors: Array<{ id: number; error: string }> }>(`${this.baseUrl}/photos/trash`, { ids });
  }

  bulkRestore(ids: number[]): Observable<{ restored: number; errors: Array<{ id: number; error: string }> }> {
    return this.http.post<{ restored: number; errors: Array<{ id: number; error: string }> }>(`${this.baseUrl}/photos/restore`, { ids });
  }

  trashPhoto(id: number): Observable<{ ok: boolean; moved: boolean }> {
    return this.http.post<{ ok: boolean; moved: boolean }>(`${this.baseUrl}/photos/${id}/trash`, {});
  }

  restorePhoto(id: number): Observable<{ ok: boolean; restored: boolean }> {
    return this.http.post<{ ok: boolean; restored: boolean }>(`${this.baseUrl}/photos/${id}/restore`, {});
  }

  purgePhoto(id: number): Observable<{ ok: boolean; purged: boolean }> {
    return this.http.delete<{ ok: boolean; purged: boolean }>(`${this.baseUrl}/photos/${id}/forever`);
  }

  getTrash(page: number = 1, limit: number = 50): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/trash`, { params });
  }

  getTrashStats(): Observable<{ count: number; totalSize: number }> {
    return this.http.get<{ count: number; totalSize: number }>(`${this.baseUrl}/trash/stats`);
  }

  emptyTrash(): Observable<{ purged: number }> {
    return this.http.post<{ purged: number }>(`${this.baseUrl}/trash/empty`, {});
  }

  restoreAllTrash(): Observable<{ restored: number; errors: Array<{ id: number; error: string }> }> {
    return this.http.post<{ restored: number; errors: Array<{ id: number; error: string }> }>(`${this.baseUrl}/trash/restore-all`, {});
  }

  // Stats
  getStatsByYear(): Observable<Array<{ year: string; count: number }>> {
    return this.http.get<Array<{ year: string; count: number }>>(`${this.baseUrl}/stats/years`);
  }

  getStatsByCamera(): Observable<Array<{ camera: string; count: number }>> {
    return this.http.get<Array<{ camera: string; count: number }>>(`${this.baseUrl}/stats/cameras`);
  }

  getStatsByType(): Observable<Array<{ mime_type: string; count: number; total_size: number }>> {
    return this.http.get<Array<{ mime_type: string; count: number; total_size: number }>>(`${this.baseUrl}/stats/types`);
  }

  getScanStatus(): Observable<{ status: string; processed_files?: number; total_files?: number }> {
    return this.http.get<{ status: string; processed_files?: number; total_files?: number }>(`${this.baseUrl}/scan/status`);
  }

  // Slideshow
  getSlideshow(shuffle: boolean = true, limit: number = 500, albumId?: number): Observable<SlideshowPhoto[]> {
    let params = new HttpParams().set('limit', limit.toString()).set('shuffle', shuffle.toString());
    if (albumId) { params = params.set('album_id', albumId.toString()); }
    return this.http.get<SlideshowPhoto[]>(`${this.baseUrl}/photos/slideshow`, { params });
  }

  // Duplicates & Index management
  getDuplicates(): Observable<Array<{ file_hash: string; count: number; photos: Array<{ id: number; file_path: string; file_size: number; mime_type: string }> }>> {
    return this.http.get<Array<{ file_hash: string; count: number; photos: Array<{ id: number; file_path: string; file_size: number; mime_type: string }> }>>(`${this.baseUrl}/photos/duplicates`);
  }

  removeFromIndex(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/photos/${id}`);
  }

  // Perceptual (near-duplicate) detection
  getPerceptualDuplicates(distance: number): Observable<{
    distance: number;
    total_with_hash: number;
    clusters: Array<{
      representative_id: number;
      photos: Array<{
        id: number;
        file_name: string;
        file_path: string;
        file_size: number;
        mime_type: string;
        date_taken: string | null;
        thumbnail_path: string | null;
        is_video: number;
        perceptual_hash: string | null;
        width: number | null;
        height: number | null;
      }>;
    }>;
  }> {
    const params = new HttpParams().set('distance', String(distance));
    return this.http.get<{
      distance: number;
      total_with_hash: number;
      clusters: Array<{
        representative_id: number;
        photos: Array<{
          id: number;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          date_taken: string | null;
          thumbnail_path: string | null;
          is_video: number;
          perceptual_hash: string | null;
          width: number | null;
          height: number | null;
        }>;
      }>;
    }>(`${this.baseUrl}/photos/duplicates/perceptual`, { params });
  }

  startPerceptualHashScan(): Observable<{ ok: boolean; message?: string }> {
    return this.http.post<{ ok: boolean; message?: string }>(`${this.baseUrl}/photos/perceptual-hash/scan`, {});
  }

  getPerceptualHashStatus(): Observable<{ running: boolean; checked: number; hashed: number; total: number }> {
    return this.http.get<{ running: boolean; checked: number; hashed: number; total: number }>(`${this.baseUrl}/photos/perceptual-hash/status`);
  }

  cancelPerceptualHashScan(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/perceptual-hash/cancel`, {});
  }

  triggerIngest(): Observable<{ imported: number; duplicates: number; errors: number }> {
    return this.http.post<{ imported: number; duplicates: number; errors: number }>(`${this.baseUrl}/ingest`, {});
  }

  // Settings
  getSettings(): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(`${this.baseUrl}/settings`);
  }

  updateSettings(settings: Record<string, string>): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.baseUrl}/settings`, settings);
  }

  getDistinctYears(): Observable<number[]> {
    return this.http.get<number[]>(`${this.baseUrl}/stats/distinct-years`);
  }

  // Tags
  getTags(): Observable<Array<{ id: number; name: string; color: string | null; photo_count: number }>> {
    return this.http.get<Array<{ id: number; name: string; color: string | null; photo_count: number }>>(`${this.baseUrl}/tags`);
  }

  createTag(name: string, color?: string): Observable<{ id: number; name: string }> {
    return this.http.post<{ id: number; name: string }>(`${this.baseUrl}/tags`, { name, color });
  }

  deleteTag(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/tags/${id}`);
  }

  getPhotoTags(photoId: number): Observable<Array<{ id: number; name: string }>> {
    return this.http.get<Array<{ id: number; name: string }>>(`${this.baseUrl}/photos/${photoId}/tags`);
  }

  addTagToPhotos(tagId: number, photoIds: number[]): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/tags/${tagId}/photos`, { photo_ids: photoIds });
  }

  removeTagFromPhotos(tagId: number, photoIds: number[]): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/tags/${tagId}/photos`, { body: { photo_ids: photoIds } });
  }

  getTagPhotos(tagId: number, page: number = 1): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/tags/${tagId}/photos`, { params });
  }

  getCleanupLog(): Observable<Array<{ id: number; file_path: string; reason: string }>> {
    return this.http.get<Array<{ id: number; file_path: string; reason: string }>>(`${this.baseUrl}/cleanup`);
  }

  clearCleanupItem(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/cleanup/${id}`);
  }

  getExportUrl(photoIds: number[]): string {
    return `${this.baseUrl}/photos/export`;
  }

  exportPhotos(photoIds: number[]): void {
    // POST with photo_ids and download the zip response
    this.http.post(`${this.baseUrl}/photos/export`, { photo_ids: photoIds }, {
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `photos-export-${Date.now()}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
    });
  }

  // Map & Search
  getMapPoints(limit: number = 5000): Observable<MapPoint[]> {
    return this.http.get<MapPoint[]>(`${this.baseUrl}/photos/map`, { params: { limit: limit.toString() } });
  }

  searchPhotos(query: string, page: number = 1, limit: number = 50): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('q', query).set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/photos/search`, { params });
  }

  // People & Faces
  getPeople(includeIgnored: boolean = false): Observable<PersonSummary[]> {
    const params = includeIgnored ? new HttpParams().set('include_ignored', 'true') : undefined;
    return this.http.get<PersonSummary[]>(`${this.baseUrl}/people`, { params });
  }

  updatePerson(id: number, data: { name?: string; status?: string }): Observable<PersonSummary> {
    return this.http.put<PersonSummary>(`${this.baseUrl}/people/${id}`, data);
  }

  getPersonPhotos(personId: number, page: number = 1): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('page', page.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/people/${personId}/photos`, { params });
  }

  triggerFaceScan(batchSize: number = 100): Observable<{ scanned: number; facesFound: number }> {
    return this.http.post<{ scanned: number; facesFound: number }>(`${this.baseUrl}/faces/scan`, { batch_size: batchSize });
  }

  generateMissingThumbnails(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/generate-thumbnails`, {});
  }

  getThumbnailScanStatus(): Observable<{ running: boolean; checked: number; generated: number; total: number }> {
    return this.http.get<{ running: boolean; checked: number; generated: number; total: number }>(`${this.baseUrl}/photos/generate-thumbnails/status`);
  }

  cancelThumbnailScan(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/photos/generate-thumbnails/cancel`, {});
  }

  getTvStatus(): Observable<{ dlna: { running: boolean }; slideshow: { available: boolean; url: string } }> {
    return this.http.get<{ dlna: { running: boolean }; slideshow: { available: boolean; url: string } }>(`${this.baseUrl}/tv/status`);
  }

  startDlna(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/tv/dlna/start`, {});
  }

  stopDlna(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/tv/dlna/stop`, {});
  }

  getFaceScanStatus(): Observable<{ running: boolean; total: number; scanned: number; faces: number; remaining: number }> {
    return this.http.get<{ running: boolean; total: number; scanned: number; faces: number; remaining: number }>(`${this.baseUrl}/faces/status`);
  }

  cancelFaceScan(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/faces/cancel`, {});
  }

  triggerFaceClustering(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/faces/cluster`, {});
  }

  getThumbnailUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/thumbnail`;
  }

  getFileUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/file`;
  }

  // DB Backup
  downloadBackup(): void {
    window.open(`${this.baseUrl}/backup`, '_blank');
  }

  getVideoPreviewUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/video-preview`;
  }

  // Cron management
  getCronStatus(): Observable<{ enabled: boolean; running: boolean; cronHour: number; nextRun: string | null; lastRun: string | null; lastResult: string | null }> {
    return this.http.get<{ enabled: boolean; running: boolean; cronHour: number; nextRun: string | null; lastRun: string | null; lastResult: string | null }>(`${this.baseUrl}/cron/status`);
  }

  setCronEnabled(enabled: boolean): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/cron/enable`, { enabled });
  }

  setCronHour(hour: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/cron/hour`, { hour });
  }

  triggerCron(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/cron/trigger`, {});
  }

  // Notifications
  getNotifications(limit: number = 20): Observable<Array<{ id: number; type: string; title: string; message: string | null; read: number; created_at: string }>> {
    return this.http.get<Array<{ id: number; type: string; title: string; message: string | null; read: number; created_at: string }>>(`${this.baseUrl}/notifications`, { params: { limit: limit.toString() } });
  }

  getUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/notifications/unread-count`);
  }

  markNotificationRead(id: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/notifications/read-all`, {});
  }

  // Activity log
  getActivityLog(): Observable<Array<{ id: number; action: string; details: string; timestamp: string }>> {
    return this.http.get<Array<{ id: number; action: string; details: string; timestamp: string }>>(`${this.baseUrl}/activity`);
  }

  // Device pairing & auth
  getDevices(): Observable<Array<{ id: number; name: string; last_seen: string }>> {
    return this.http.get<Array<{ id: number; name: string; last_seen: string }>>(`${this.baseUrl}/auth/devices`);
  }

  generatePairingCode(): Observable<{ code: string }> {
    return this.http.post<{ code: string }>(`${this.baseUrl}/auth/generate-code`, {});
  }

  pairDevice(code: string, name: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/auth/pair`, { code, name });
  }

  revokeDevice(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/auth/devices/${id}`);
  }

  // People merge
  mergePeople(keepId: number, mergeId: number): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/people/merge`, { keep_id: keepId, merge_id: mergeId });
  }
}
