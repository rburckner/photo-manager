import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import type { Album, SlideshowPhoto } from '../../models/photo.model';

@Component({
  selector: 'app-tv',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="tv-container"
      [class.controls-visible]="showControls"
      (mousemove)="showControlsBriefly()"
      (click)="showControlsBriefly()"
    >
      <!-- Current photo -->
      @if (currentPhoto) {
        <img
          [src]="api.getFileUrl(currentPhoto.id)"
          class="slide"
          [class.fade-in]="fadeIn"
          (load)="onImageLoaded()"
        />
      }

      <!-- Overlay info (fades out) -->
      @if (currentPhoto && showOverlay) {
        <div class="overlay">
          @if (currentPhoto.date_taken) {
            <div class="overlay-date">
              {{ formatDate(currentPhoto.date_taken) }}
            </div>
          }
          @if (currentPhoto.folder_path) {
            <div class="overlay-folder">{{ currentPhoto.folder_path }}</div>
          }
          <div class="overlay-counter">{{ currentIndex + 1 }} / {{ photos.length }}</div>
        </div>
      }

      <!-- Controls (show on hover/tap, auto-hide) -->
      <div class="controls">
        <div class="controls-top">
          <button (click)="toggleShuffle()" [class.active]="shuffle">
            &#128256; Shuffle
          </button>
          <div class="speed-controls">
            <button (click)="setInterval(3)">3s</button>
            <button (click)="setInterval(5)" [class.active]="intervalSec === 5">5s</button>
            <button (click)="setInterval(10)" [class.active]="intervalSec === 10">10s</button>
            <button (click)="setInterval(15)">15s</button>
            <button (click)="setInterval(30)">30s</button>
          </div>
          @if (albums.length > 0) {
            <select class="album-select" (change)="onAlbumChange($event)">
              <option value="">All Photos</option>
              @for (album of albums; track album.id) {
                <option [value]="album.id">{{ album.name }}</option>
              }
            </select>
          }
        </div>

        <div class="controls-center">
          <button class="nav-btn" (click)="prevSlide()">&#10094;</button>
          <button class="play-btn" (click)="togglePlay()">
            {{ playing ? '&#9646;&#9646;' : '&#9654;' }}
          </button>
          <button class="nav-btn" (click)="nextSlide()">&#10095;</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tv-container {
      position: fixed;
      inset: 0;
      background: #000;
      overflow: hidden;
      cursor: none;

      &.controls-visible {
        cursor: default;
      }
    }

    .slide {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0;
      transition: opacity 0.8s ease;

      &.fade-in {
        opacity: 1;
      }
    }

    /* ── Info overlay ── */
    .overlay {
      position: absolute;
      bottom: 40px;
      left: 40px;
      z-index: 10;
      animation: fadeOverlay 4s ease forwards;
    }

    @keyframes fadeOverlay {
      0% { opacity: 1; }
      70% { opacity: 1; }
      100% { opacity: 0; }
    }

    .overlay-date {
      font-size: 1.8rem;
      color: #fff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
      font-weight: 300;
    }

    .overlay-folder {
      font-size: 0.9rem;
      color: rgba(255,255,255,0.7);
      text-shadow: 0 1px 4px rgba(0,0,0,0.8);
      margin-top: 4px;
    }

    .overlay-counter {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.4);
      margin-top: 8px;
    }

    /* ── Controls ── */
    .controls {
      position: absolute;
      inset: 0;
      z-index: 20;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }

    .controls-visible .controls {
      opacity: 1;
      pointer-events: auto;
    }

    .controls-top {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 16px 24px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
      display: flex;
      align-items: center;
      gap: 12px;

      button {
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        color: #ccc;
        padding: 6px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;

        &:hover { background: rgba(255,255,255,0.2); }
        &.active { background: rgba(255,255,255,0.3); color: #fff; }
      }
    }

    .speed-controls {
      display: flex;
      gap: 4px;
    }

    .album-select {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #ccc;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
      margin-left: auto;

      option { background: #222; color: #ddd; }
    }

    .controls-center {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .nav-btn, .play-btn {
      background: rgba(0,0,0,0.5);
      border: none;
      color: #fff;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover { background: rgba(255,255,255,0.2); }
    }

    .nav-btn {
      width: 48px;
      height: 48px;
      font-size: 1.5rem;
    }

    .play-btn {
      width: 64px;
      height: 64px;
      font-size: 1.5rem;
    }
  `],
})
export class TvComponent implements OnInit, OnDestroy {
  photos: SlideshowPhoto[] = [];
  currentPhoto: SlideshowPhoto | null = null;
  currentIndex = 0;
  fadeIn = false;
  showOverlay = false;
  showControls = false;
  playing = true;
  shuffle = true;
  intervalSec = 5;
  albums: Album[] = [];
  selectedAlbumId: number | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private controlsTimer: ReturnType<typeof setTimeout> | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // Load albums for the selector
    this.api.getAlbums().subscribe({ next: (a) => { this.albums = a; } });

    // Check query params
    const params = this.route.snapshot.queryParams;
    if (params['album']) {
      this.selectedAlbumId = parseInt(params['album'], 10);
    }
    if (params['interval']) {
      this.intervalSec = parseInt(params['interval'], 10);
    }
    if (params['shuffle'] === 'false') {
      this.shuffle = false;
    }

    this.loadPhotos();

    this.keyHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': this.nextSlide(); break;
        case 'ArrowLeft': this.prevSlide(); break;
        case ' ':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'Escape': window.history.back(); break;
      }
      this.showControlsBriefly();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.controlsTimer) clearTimeout(this.controlsTimer);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }

  loadPhotos(): void {
    const albumId = this.selectedAlbumId ?? undefined;
    this.api.getSlideshow(this.shuffle, 500, albumId).subscribe({
      next: (photos) => {
        this.photos = photos;
        if (photos.length > 0) {
          this.currentIndex = 0;
          this.showSlide(0);
          this.startTimer();
        }
        this.cdr.detectChanges();
      },
    });
  }

  showSlide(index: number): void {
    this.fadeIn = false;
    this.showOverlay = false;
    this.cdr.detectChanges();

    // Small delay for fade transition reset
    setTimeout(() => {
      this.currentIndex = index;
      this.currentPhoto = this.photos[index] ?? null;
      this.showOverlay = true;
      this.cdr.detectChanges();
    }, 50);
  }

  onImageLoaded(): void {
    this.fadeIn = true;
    this.cdr.detectChanges();
  }

  nextSlide(): void {
    if (this.photos.length === 0) return;
    const next = (this.currentIndex + 1) % this.photos.length;
    this.showSlide(next);
  }

  prevSlide(): void {
    if (this.photos.length === 0) return;
    const prev = (this.currentIndex - 1 + this.photos.length) % this.photos.length;
    this.showSlide(prev);
  }

  togglePlay(): void {
    this.playing = !this.playing;
    if (this.playing) {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  toggleShuffle(): void {
    this.shuffle = !this.shuffle;
    this.loadPhotos();
  }

  setInterval(sec: number): void {
    this.intervalSec = sec;
    if (this.playing) {
      this.stopTimer();
      this.startTimer();
    }
  }

  onAlbumChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedAlbumId = value ? parseInt(value, 10) : null;
    this.loadPhotos();
  }

  showControlsBriefly(): void {
    this.showControls = true;
    if (this.controlsTimer) clearTimeout(this.controlsTimer);
    this.controlsTimer = setTimeout(() => {
      this.showControls = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => { this.nextSlide(); }, this.intervalSec * 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
