import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  iconRetinaUrl: 'leaflet/marker-icon-2x.png',
  iconUrl: 'leaflet/marker-icon.png',
  shadowUrl: 'leaflet/marker-shadow.png',
});

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent],
  template: `
    <div class="map-container">
      <div class="map-header">
        <h2>Map</h2>
        <span class="point-count">{{ filteredCount }} / {{ pointCount }} geotagged photos</span>
        <div class="map-filters">
          <label>
            <span class="filter-label">From</span>
            <input type="month" [value]="fromDate" (change)="onFromChange($event)" class="date-input" />
          </label>
          <span class="sep">-</span>
          <label>
            <span class="filter-label">To</span>
            <input type="month" [value]="toDate" (change)="onToChange($event)" class="date-input" />
          </label>
          <button class="btn-reset" (click)="resetFilter()">All</button>
        </div>
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

    .map-filters {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;

      label {
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }

    .filter-label {
      font-size: 0.7rem;
      color: #888;
      text-transform: uppercase;
    }

    .date-input {
      background: #222;
      border: 1px solid #444;
      color: #e0e0e0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;

      &:focus { outline: none; border-color: #666; }
      &::-webkit-calendar-picker-indicator { filter: invert(0.7); }
    }

    .sep { color: #555; }

    .btn-reset {
      background: #222;
      border: 1px solid #444;
      color: #aaa;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;

      &:hover { background: #333; }
    }

    .map {
      flex: 1;
      min-height: 0; /* flex child needs this to shrink */
    }

    :host ::ng-deep .leaflet-container {
      height: 100%;
      width: 100%;
      background: #1a1a1a;
    }

    :host ::ng-deep .leaflet-tile-pane {
      opacity: 1;
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
  filteredCount = 0;
  selectedPhoto: Photo | null = null;
  prevPhoto = { emit: () => {} };
  nextPhoto = { emit: () => {} };

  fromDate = '';
  toDate = '';

  private map: L.Map | null = null;
  private clusterLayer: L.MarkerClusterGroup | null = null;
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
      center: [39.8283, -98.5795],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Leaflet needs a resize kick after the flex container settles
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 100);

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

  onFromChange(event: Event): void {
    this.fromDate = (event.target as HTMLInputElement).value;
    this.renderMarkers();
  }

  onToChange(event: Event): void {
    this.toDate = (event.target as HTMLInputElement).value;
    this.renderMarkers();
  }

  resetFilter(): void {
    this.fromDate = '';
    this.toDate = '';
    this.renderMarkers();
  }

  private getFilteredPoints(): MapPoint[] {
    if (!this.fromDate && !this.toDate) return this.points;

    return this.points.filter((p) => {
      const date = p.date_taken?.slice(0, 7) ?? '';
      if (!date) return false;
      if (this.fromDate && date < this.fromDate) return false;
      if (this.toDate && date > this.toDate) return false;
      return true;
    });
  }

  private renderMarkers(): void {
    if (!this.map) return;

    // Remove old cluster layer
    if (this.clusterLayer) {
      this.map.removeLayer(this.clusterLayer);
      this.clusterLayer = null;
    }

    const filtered = this.getFilteredPoints();
    this.filteredCount = filtered.length;

    if (filtered.length === 0) {
      this.cdr.detectChanges();
      return;
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    for (const point of filtered) {
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

    this.clusterLayer = cluster;
    this.map.addLayer(cluster);

    // Fit bounds to visible markers
    const bounds = L.latLngBounds(filtered.map((p) => [p.gps_lat, p.gps_lng] as L.LatLngTuple));
    this.map.fitBounds(bounds, { padding: [50, 50] });

    this.cdr.detectChanges();
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
