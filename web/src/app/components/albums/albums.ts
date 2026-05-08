import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import { ThumbSizeSliderComponent } from '../thumb-size-slider/thumb-size-slider';
import type { Album, Photo } from '../../models/photo.model';

@Component({
  selector: 'app-albums',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent, ThumbSizeSliderComponent],
  template: `
    <div class="albums-container">

      <!-- Album list view -->
      @if (!selectedAlbum) {
        <div class="albums-header">
          <h2>Albums</h2>
          <button class="btn-create" (click)="showCreateDialog = true">+ New Album</button>
        </div>

        @if (albums.length === 0 && !loading) {
          <div class="empty-state">
            <p>No albums yet</p>
            <button class="btn-create" (click)="showCreateDialog = true">Create your first album</button>
          </div>
        }

        <div class="album-grid">
          @for (album of albums; track album.id) {
            <div class="album-card" (click)="openAlbum(album)">
              <div class="album-cover">
                @if (album.cover_photo_id) {
                  <img
                    [src]="api.getThumbnailUrl(album.cover_photo_id)"
                    [alt]="album.name"
                    (error)="onImageError($event)"
                  />
                } @else {
                  <div class="no-cover">&#128247;</div>
                }
              </div>
              <div class="album-info">
                <div class="album-name">{{ album.name }}</div>
                <div class="album-count">{{ album.photo_count }} items</div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Album detail view -->
      @if (selectedAlbum) {
        <div class="album-detail-header">
          <button class="btn-back" (click)="closeAlbum()">&larr;</button>
          <div class="album-title">
            <h2>{{ selectedAlbum.name }}</h2>
            @if (selectedAlbum.description) {
              <p class="album-desc">{{ selectedAlbum.description }}</p>
            }
            <span class="album-count">{{ albumPhotoTotal }} items</span>
          </div>
          <div class="album-actions">
            <app-thumb-size-slider />
            <button class="btn-action" (click)="showEditDialog = true">Edit</button>
            <button class="btn-action btn-danger" (click)="confirmDeleteAlbum()">Delete</button>
          </div>
        </div>

        <div class="photo-grid" (scroll)="onAlbumScroll($event)">
          @for (photo of albumPhotos; track photo.id) {
            <div
              class="photo-card"
              [class.selectable]="selection.isSelectingSignal()"
              [class.selected]="selection.selectedIdsSignal().has(photo.id)"
              (click)="onPhotoClick(photo, $event)"
              (mouseenter)="photo.is_video === 1 ? onVideoHover($event, photo, true) : null"
              (mouseleave)="photo.is_video === 1 ? onVideoHover($event, photo, false) : null"
            >
              @if (selection.isSelectingSignal()) {
                <div class="select-check">&#10003;</div>
              }
              <img
                [src]="api.getThumbnailUrl(photo.id)"
                [alt]="photo.file_name"
                loading="lazy"
                (error)="onImageError($event)"
              />
              @if (photo.is_video === 1) {
                <div class="video-badge">&#9654;</div>
              }
            </div>
          }
          @if (albumPhotos.length === 0 && !loadingPhotos) {
            <div class="empty-album">This album is empty</div>
          }
        </div>
      }

      <!-- Create/Edit dialog -->
      @if (showCreateDialog || showEditDialog) {
        <div class="dialog-overlay" (click)="closeDialogs()">
          <div class="dialog" (click)="$event.stopPropagation()">
            <h3>{{ showEditDialog ? 'Edit Album' : 'New Album' }}</h3>
            <label>
              <span>Name</span>
              <input
                type="text"
                [(ngModel)]="dialogName"
                placeholder="Album name"
                class="dialog-input"
                (keydown.enter)="saveDialog()"
                autofocus
              />
            </label>
            <label>
              <span>Description</span>
              <input
                type="text"
                [(ngModel)]="dialogDescription"
                placeholder="Optional description"
                class="dialog-input"
              />
            </label>
            <div class="dialog-actions">
              <button class="btn-cancel" (click)="closeDialogs()">Cancel</button>
              <button class="btn-save" (click)="saveDialog()" [disabled]="!dialogName.trim()">
                {{ showEditDialog ? 'Save' : 'Create' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Lightbox -->
      @if (selectedPhoto) {
        <app-lightbox
          [photo]="selectedPhoto"
          (close)="closeLightbox()"
          (prev)="navigatePhoto(-1)"
          (next)="navigatePhoto(1)"
        />
      }

    </div>
  `,
  styles: [`
    .albums-container {
      height: 100vh;
      overflow-y: auto;
      padding: 20px;
    }

    /* ── Header ── */
    .albums-header, .album-detail-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;

      h2 { margin: 0; font-size: 1.2rem; color: #ddd; }
    }

    .album-detail-header {
      .album-title { flex: 1; }
      .album-desc { margin: 4px 0 0; font-size: 0.8rem; color: #888; }
      .album-count { font-size: 0.75rem; color: #666; }
    }

    .btn-create {
      background: #333;
      border: 1px solid #555;
      color: #ddd;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;

      &:hover { background: #444; }
    }

    .btn-back {
      background: none;
      border: none;
      color: #aaa;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 4px 8px;

      &:hover { color: #fff; }
    }

    .btn-action {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #ccc;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;

      &:hover { background: #333; }
    }

    .btn-danger {
      color: #e55;
      border-color: #633;

      &:hover { background: #3a1a1a; }
    }

    .album-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    /* ── Album grid ── */
    .album-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }

    .album-card {
      background: #222;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.15s, background 0.15s;

      &:hover {
        transform: translateY(-2px);
        background: #2a2a2a;
      }
    }

    .album-cover {
      aspect-ratio: 4/3;
      background: #1a1a1a;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .no-cover {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      color: #333;
    }

    .album-info {
      padding: 10px 12px;
    }

    .album-name {
      font-size: 0.9rem;
      color: #ddd;
      font-weight: 500;
    }

    .album-count {
      font-size: 0.75rem;
      color: #666;
      margin-top: 2px;
    }

    .empty-state, .empty-album {
      text-align: center;
      padding: 60px 20px;
      color: #555;

      p { margin-bottom: 16px; }
    }

    .empty-album {
      grid-column: 1 / -1;
    }

    /* ── Photo grid ── */
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--thumb-size, 160px), 1fr));
      gap: 4px;
    }

    .photo-card {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 4px;
      cursor: pointer;
      background: #222;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s;
      }

      &:hover img { transform: scale(1.05); }
    }

    .video-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    /* ── Dialog ── */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 900;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background: #222;
      border: 1px solid #444;
      border-radius: 12px;
      padding: 24px;
      width: 400px;
      max-width: 90vw;

      h3 { margin: 0 0 16px; color: #ddd; font-size: 1.1rem; }

      label {
        display: block;
        margin-bottom: 12px;

        span {
          display: block;
          font-size: 0.75rem;
          color: #888;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      }
    }

    .dialog-input {
      width: 100%;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #e0e0e0;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.9rem;

      &:focus { outline: none; border-color: #666; }
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .btn-cancel {
      background: none;
      border: 1px solid #444;
      color: #aaa;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;

      &:hover { background: #2a2a2a; }
    }

    .btn-save {
      background: #2a6acf;
      border: none;
      color: #fff;
      padding: 8px 20px;
      border-radius: 6px;
      cursor: pointer;

      &:hover { background: #3577db; }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
  `],
})
export class AlbumsComponent implements OnInit {
  albums: Album[] = [];
  loading = true;

  selectedAlbum: Album | null = null;
  albumPhotos: Photo[] = [];
  loadingPhotos = false;
  albumPhotoTotal = 0;
  albumPhotoPage = 1;
  albumHasMore = true;

  selectedPhoto: Photo | null = null;

  showCreateDialog = false;
  showEditDialog = false;
  dialogName = '';
  dialogDescription = '';

  private lastClickedId: number | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    public readonly selection: SelectionService,
  ) {}

  ngOnInit(): void {
    this.loadAlbums();
  }

  loadAlbums(): void {
    this.api.getAlbums().subscribe({
      next: (albums) => {
        this.albums = albums;
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  openAlbum(album: Album): void {
    this.selectedAlbum = album;
    this.albumPhotos = [];
    this.albumPhotoPage = 1;
    this.albumHasMore = true;
    this.loadAlbumPhotos();
  }

  closeAlbum(): void {
    this.selectedAlbum = null;
    this.albumPhotos = [];
  }

  loadAlbumPhotos(): void {
    if (this.loadingPhotos || !this.albumHasMore || !this.selectedAlbum) return;

    this.loadingPhotos = true;
    this.api.getAlbumPhotos(this.selectedAlbum.id, this.albumPhotoPage).subscribe({
      next: (response) => {
        this.albumPhotos.push(...response.photos);
        this.albumPhotoTotal = response.pagination.total;
        this.albumHasMore = this.albumPhotoPage < response.pagination.totalPages;
        this.albumPhotoPage++;
        this.loadingPhotos = false;
        this.cdr.detectChanges();
      },
    });
  }

  onAlbumScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) {
      this.loadAlbumPhotos();
    }
  }

  saveDialog(): void {
    const name = this.dialogName.trim();
    if (!name) return;

    if (this.showEditDialog && this.selectedAlbum) {
      this.api.updateAlbum(this.selectedAlbum.id, {
        name,
        description: this.dialogDescription.trim() || undefined,
      }).subscribe({
        next: (album) => {
          this.selectedAlbum = { ...this.selectedAlbum!, ...album };
          const idx = this.albums.findIndex((a) => a.id === album.id);
          if (idx >= 0) {
            this.albums[idx] = { ...this.albums[idx]!, ...album };
          }
          this.closeDialogs();
        },
      });
    } else {
      this.api.createAlbum(name, this.dialogDescription.trim() || undefined).subscribe({
        next: () => {
          this.closeDialogs();
          this.loadAlbums();
        },
      });
    }
  }

  closeDialogs(): void {
    this.showCreateDialog = false;
    this.showEditDialog = false;
    this.dialogName = '';
    this.dialogDescription = '';
  }

  confirmDeleteAlbum(): void {
    if (!this.selectedAlbum) return;
    if (!confirm(`Delete album "${this.selectedAlbum.name}"? Photos won't be deleted.`)) return;

    this.api.deleteAlbum(this.selectedAlbum.id).subscribe({
      next: () => {
        this.selectedAlbum = null;
        this.loadAlbums();
      },
    });
  }

  onPhotoClick(photo: Photo, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    if (event.shiftKey && this.lastClickedId !== null && this.selection.isSelecting) {
      const startIdx = this.albumPhotos.findIndex((p) => p.id === this.lastClickedId);
      const endIdx = this.albumPhotos.findIndex((p) => p.id === photo.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const rangeIds = this.albumPhotos.slice(from, to + 1).map((p) => p.id);
        this.selection.selectAll(rangeIds);
      }
      return;
    }
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    this.openPhoto(photo);
  }

  openPhoto(photo: Photo): void {
    this.selectedPhoto = photo;
  }

  closeLightbox(): void {
    this.selectedPhoto = null;
  }

  navigatePhoto(direction: number): void {
    if (!this.selectedPhoto) return;
    const idx = this.albumPhotos.findIndex((p) => p.id === this.selectedPhoto!.id);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < this.albumPhotos.length) {
      this.selectedPhoto = this.albumPhotos[newIdx]!;
    }
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.src.endsWith('/ladybug.svg')) return;
    img.src = '/ladybug.svg';
  }

  onVideoHover(event: Event, photo: { id: number }, enter: boolean): void {
    const card = (event.target as HTMLElement).closest('.photo-card') as HTMLElement;
    if (!card) return;

    if (enter) {
      const video = document.createElement('video');
      video.src = `/api/photos/${photo.id}/video-preview`;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.className = 'video-preview';
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2';
      card.appendChild(video);
    } else {
      const video = card.querySelector('.video-preview');
      if (video) {
        (video as HTMLVideoElement).pause();
        video.remove();
      }
    }
  }
}
