import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Photo, TimelineResponse, CollectionStats, PaginatedResponse, FolderEntry, Album, MapPoint, SlideshowPhoto } from '../models/photo.model';

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

  // Slideshow
  getSlideshow(shuffle: boolean = true, limit: number = 500, albumId?: number): Observable<SlideshowPhoto[]> {
    let params = new HttpParams().set('limit', limit.toString()).set('shuffle', shuffle.toString());
    if (albumId) { params = params.set('album_id', albumId.toString()); }
    return this.http.get<SlideshowPhoto[]>(`${this.baseUrl}/photos/slideshow`, { params });
  }

  // Map & Search
  getMapPoints(limit: number = 5000): Observable<MapPoint[]> {
    return this.http.get<MapPoint[]>(`${this.baseUrl}/photos/map`, { params: { limit: limit.toString() } });
  }

  searchPhotos(query: string, page: number = 1, limit: number = 50): Observable<PaginatedResponse<Photo>> {
    const params = new HttpParams().set('q', query).set('page', page.toString()).set('limit', limit.toString());
    return this.http.get<PaginatedResponse<Photo>>(`${this.baseUrl}/photos/search`, { params });
  }

  getThumbnailUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/thumbnail`;
  }

  getFileUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/file`;
  }
}
