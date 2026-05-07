import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { ApiService } from '../../services/api.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { MapPoint, Photo } from '../../models/photo.model';

// Fix Leaflet default icon paths (broken by bundlers)
/* eslint-disable */
delete (L.Icon.Default.prototype as any)['_getIconUrl'];
/* eslint-enable */
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, LightboxComponent],
  template: `
    <div class="map-container">
      <div class="map-header">
        <h2>Map</h2>
        <span class="point-count">{{ pointCount }} geotagged photos</span>
      </div>
      <div #mapEl class="map"></div>

      @if (loading) {
        <div class="map-loading">Loading geotagged photos...</div>
      }
    </div>

    @if (selectedPhoto) {
      <app-lightbox
        [photo]="selectedPhoto"
        (close)="closeLightbox()"
        (prev)="prevPhoto.emit()"
        (next)="nextPhoto.emit()"
      />
    }
  `,
  styles: [`
    .map-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .map-header {
      padding: 14px 20px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-shrink: 0;
      background: #111;

      h2 { margin: 0; font-size: 1.1rem; color: #ddd; }
      .point-count { font-size: 0.8rem; color: #666; }
    }

    .map {
      flex: 1;
    }

    .map-loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: #aaa;
      padding: 16px 24px;
      border-radius: 8px;
      z-index: 500;
    }

    :host ::ng-deep {
      .photo-popup {
        text-align: center;

        img {
          width: 150px;
          height: 150px;
          object-fit: cover;
          border-radius: 4px;
          cursor: pointer;
        }

        .popup-date {
          margin-top: 4px;
          font-size: 0.75rem;
          color: #666;
        }
      }

      .leaflet-popup-content-wrapper {
        background: #222;
        color: #ddd;
        border-radius: 8px;
      }

      .leaflet-popup-tip {
        background: #222;
      }

      .leaflet-popup-close-button {
        color: #aaa !important;
      }
    }
  `],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLElement>;

  loading = true;
  pointCount = 0;
  selectedPhoto: Photo | null = null;
  prevPhoto = { emit: () => {} };
  nextPhoto = { emit: () => {} };

  private map: L.Map | null = null;
  private points: MapPoint[] = [];

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getMapPoints().subscribe({
      next: (points) => {
        this.points = points;
        this.pointCount = points.length;
        this.loading = false;
        this.renderMarkers();
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [39.8283, -98.5795], // Center of US
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Render markers if data already loaded
    if (this.points.length > 0) {
      this.renderMarkers();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private renderMarkers(): void {
    if (!this.map || this.points.length === 0) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    for (const point of this.points) {
      const marker = L.marker([point.gps_lat, point.gps_lng]);

      const thumbUrl = this.api.getThumbnailUrl(point.id);
      const dateStr = point.date_taken
        ? new Date(point.date_taken).toLocaleDateString()
        : '';

      marker.bindPopup(`
        <div class="photo-popup">
          <img src="${thumbUrl}" alt="Photo" data-photo-id="${point.id}" />
          ${dateStr ? `<div class="popup-date">${dateStr}</div>` : ''}
        </div>
      `, { minWidth: 160 });

      marker.on('popupopen', () => {
        const popup = marker.getPopup();
        if (popup) {
          const el = popup.getElement();
          const img = el?.querySelector('img[data-photo-id]') as HTMLImageElement | null;
          if (img) {
            img.addEventListener('click', () => {
              this.openPhotoById(point.id);
            });
          }
        }
      });

      cluster.addLayer(marker);
    }

    this.map.addLayer(cluster);

    // Fit bounds to markers
    if (this.points.length > 0) {
      const bounds = L.latLngBounds(this.points.map((p) => [p.gps_lat, p.gps_lng] as L.LatLngTuple));
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  private openPhotoById(id: number): void {
    this.api.getPhoto(id).subscribe({
      next: (photo) => {
        this.selectedPhoto = photo;
        this.cdr.detectChanges();
      },
    });
  }

  closeLightbox(): void {
    this.selectedPhoto = null;
  }
}
