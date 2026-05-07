import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import type { Photo } from '../../models/photo.model';

@Component({
  selector: 'app-lightbox',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lightbox-overlay" (click)="close.emit()">
      <div class="lightbox-container" (click)="$event.stopPropagation()">

        <!-- Media -->
        <div class="media-panel">
          @if (photo.is_video === 1) {
            <video
              [src]="api.getFileUrl(photo.id)"
              controls
              autoplay
              class="media"
            ></video>
          } @else {
            <img
              [src]="api.getFileUrl(photo.id)"
              [alt]="photo.file_name"
              class="media"
            />
          }
        </div>

        <!-- Info panel (toggle) -->
        @if (showInfo && fullPhoto) {
          <div class="info-panel">
            <h3>Details</h3>

            <div class="info-section">
              <div class="info-label">Date</div>
              <div class="info-value">
                {{ fullPhoto.date_taken ? (fullPhoto.date_taken | date:'EEEE, MMMM d, y, h:mm a') : 'Unknown' }}
              </div>
            </div>

            @if (fullPhoto.camera_make || fullPhoto.camera_model) {
              <div class="info-section">
                <div class="info-label">Camera</div>
                <div class="info-value">
                  {{ formatCamera(fullPhoto.camera_make, fullPhoto.camera_model) }}
                </div>
              </div>
            }

            @if (fullPhoto.lens) {
              <div class="info-section">
                <div class="info-label">Lens</div>
                <div class="info-value">{{ fullPhoto.lens }}</div>
              </div>
            }

            @if (fullPhoto.width && fullPhoto.height) {
              <div class="info-section">
                <div class="info-label">Resolution</div>
                <div class="info-value">{{ fullPhoto.width }} &times; {{ fullPhoto.height }}</div>
              </div>
            }

            @if (fullPhoto.duration) {
              <div class="info-section">
                <div class="info-label">Duration</div>
                <div class="info-value">{{ formatDuration(fullPhoto.duration) }}</div>
              </div>
            }

            <div class="info-section">
              <div class="info-label">Size</div>
              <div class="info-value">{{ formatBytes(fullPhoto.file_size) }}</div>
            </div>

            <div class="info-section">
              <div class="info-label">Type</div>
              <div class="info-value">{{ fullPhoto.mime_type }}</div>
            </div>

            <div class="info-section">
              <div class="info-label">Path</div>
              <div class="info-value path">{{ fullPhoto.folder_path }}</div>
            </div>

            @if (fullPhoto.gps_lat != null && fullPhoto.gps_lng != null) {
              <div class="info-section">
                <div class="info-label">Location</div>
                <div class="info-value">
                  <a
                    [href]="'https://www.openstreetmap.org/?mlat=' + fullPhoto.gps_lat + '&mlon=' + fullPhoto.gps_lng + '#map=15/' + fullPhoto.gps_lat + '/' + fullPhoto.gps_lng"
                    target="_blank"
                    rel="noopener"
                    class="map-link"
                  >
                    {{ fullPhoto.gps_lat!.toFixed(4) }}, {{ fullPhoto.gps_lng!.toFixed(4) }}
                  </a>
                </div>
              </div>
            }
          </div>
        }

        <!-- Controls -->
        <button class="btn-close" (click)="close.emit()">&times;</button>
        <button class="btn-info" [class.active]="showInfo" (click)="toggleInfo()">
          &#9432;
        </button>
        <button class="btn-prev" (click)="prev.emit()">&lsaquo;</button>
        <button class="btn-next" (click)="next.emit()">&rsaquo;</button>

      </div>
    </div>
  `,
  styles: [`
    .lightbox-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-container {
      position: relative;
      display: flex;
      max-width: 98vw;
      max-height: 96vh;
      gap: 0;
    }

    .media-panel {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
    }

    .media {
      max-width: 95vw;
      max-height: 92vh;
      object-fit: contain;
    }

    .info-panel .media {
      max-width: 65vw;
    }

    /* ── Info panel ── */
    .info-panel {
      width: 280px;
      background: #1a1a1a;
      border-left: 1px solid #333;
      padding: 20px;
      overflow-y: auto;
      flex-shrink: 0;

      h3 {
        margin: 0 0 16px;
        font-size: 0.95rem;
        color: #ddd;
      }
    }

    .info-section {
      margin-bottom: 12px;
    }

    .info-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 0.85rem;
      color: #ccc;

      &.path {
        font-size: 0.75rem;
        word-break: break-all;
        color: #888;
      }
    }

    .map-link {
      color: #6cacf0;
      text-decoration: none;

      &:hover { text-decoration: underline; }
    }

    /* ── Buttons ── */
    .btn-close, .btn-info, .btn-prev, .btn-next {
      position: absolute;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      color: #fff;
      cursor: pointer;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;

      &:hover { background: rgba(255, 255, 255, 0.15); }
    }

    .btn-close {
      top: 8px;
      right: 8px;
      width: 36px;
      height: 36px;
      font-size: 1.5rem;
      z-index: 10;
    }

    .btn-info {
      top: 8px;
      right: 52px;
      width: 36px;
      height: 36px;
      font-size: 1.2rem;
      z-index: 10;

      &.active {
        background: rgba(255, 255, 255, 0.2);
      }
    }

    .btn-prev, .btn-next {
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 44px;
      font-size: 2rem;
    }

    .btn-prev { left: 8px; }
    .btn-next { right: 8px; }
  `],
})
export class LightboxComponent implements OnInit, OnDestroy {
  @Input({ required: true }) photo!: Photo;
  @Output() close = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  fullPhoto: Photo | null = null;
  showInfo = false;

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadFullPhoto();

    this.keyHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': this.close.emit(); break;
        case 'ArrowLeft': this.prev.emit(); break;
        case 'ArrowRight': this.next.emit(); break;
        case 'i': this.toggleInfo(); break;
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  ngOnDestroy(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
  }

  private loadFullPhoto(): void {
    // If the input photo already has full data, use it
    if (this.photo.file_size) {
      this.fullPhoto = this.photo;
      return;
    }

    this.api.getPhoto(this.photo.id).subscribe({
      next: (photo) => {
        this.fullPhoto = photo;
        this.cdr.detectChanges();
      },
    });
  }

  toggleInfo(): void {
    this.showInfo = !this.showInfo;
    if (this.showInfo && !this.fullPhoto) {
      this.loadFullPhoto();
    }
  }

  formatCamera(make: string | null, model: string | null): string {
    return [make, model].filter((v) => v != null && v.length > 0).join(' ');
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(1)} ${units[i]}`;
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
