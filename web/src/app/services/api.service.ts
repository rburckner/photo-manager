import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Photo, TimelineResponse, CollectionStats } from '../models/photo.model';

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

  getThumbnailUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/thumbnail`;
  }

  getFileUrl(id: number): string {
    return `${this.baseUrl}/photos/${id}/file`;
  }
}
