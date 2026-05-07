import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Photo, TimelineResponse, CollectionStats, PaginatedResponse, FolderEntry, Album, MapPoint, SlideshowPhoto, PersonSummary } from '../models/photo.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  getTimeline(page: number = 0, limit: number = 100): Observable<TimelineResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
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

  getPhotos(page: number = 1, limit: number = 50, folder?: string): Observable<PaginatedResponse<Photo>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (folder) {
      params = params.set('folder', folder);
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

  triggerIngest(): Observable<{ imported: number; duplicates: number; errors: number }> {
    return this.http.post<{ imported: number; duplicates: number; errors: number }>(`${this.baseUrl}/ingest`, {});
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

  triggerFaceClustering(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/faces/cluster`, {});
  }

  getThumbnailUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/thumbnail`;
  }

  getFileUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/file`;
  }
}
