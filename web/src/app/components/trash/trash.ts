import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { ToastService } from '../../services/toast.service';
import { LightboxComponent } from '../lightbox/lightbox';
import { ThumbSizeSliderComponent } from '../thumb-size-slider/thumb-size-slider';
import type { Photo } from '../../models/photo.model';

@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [CommonModule, LightboxComponent, ThumbSizeSliderComponent],
  template: `
    <div class="trash-container">
      <div class="trash-header">
        <h2>Trash</h2>
        <span class="count">{{ totalPhotos }} items · {{ formatSize(totalSize) }}</span>
        <span class="hint">Items are auto-deleted after 30 days</span>
        <div class="header-actions">
          <app-thumb-size-slider />
          <button class="btn-restore-all" (click)="restoreAll()" [disabled]="totalPhotos === 0 || working">
            Restore all
          </button>
          <button class="btn-empty" (click)="emptyTrash()" [disabled]="totalPhotos === 0 || working">
            Empty trash
          </button>
        </div>
      </div>

      <div class="photo-grid" (scroll)="onScroll($event)">
        @for (photo of photos; track photo.id) {
          <div class="photo-card" (click)="onPhotoClick(photo)">
            <img [src]="api.getThumbnailUrl(photo.id)" loading="lazy" (error)="onImageError($event)" />
            <div class="card-actions" (click)="$event.stopPropagation()">
              <button class="card-btn" (click)="restoreOne(photo)" title="Restore">&#10227;</button>
              <button class="card-btn card-btn-danger" (click)="purgeOne(photo)" title="Delete forever">&#10005;</button>
            </div>
            <div class="trash-date">{{ formatDate(photo.deleted_at) }}</div>
          </div>
        }
        @if (loading) { <div class="grid-loading">Loading...</div> }
        @if (!loading && photos.length === 0) { <div class="empty">Trash is empty</div> }
      </div>
    </div>

    @if (selectedPhoto) {
      <app-lightbox [photo]="selectedPhoto" (close)="closeLightbox()" (prev)="navigatePhoto(-1)" (next)="navigatePhoto(1)" />
    }
  `,
  styles: [`
    .trash-container { height: 100vh; display: flex; flex-direction: column; padding: 20px; }
    .trash-header {
      display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
      h2 { margin: 0; font-size: 1.2rem; color: #ddd; }
      .count { font-size: 0.8rem; color: #888; }
      .hint { font-size: 0.75rem; color: #666; }
      .header-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
    }
    .btn-restore-all, .btn-empty {
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
    .btn-restore-all {
      background: #1a3a1a; border: 1px solid #2a5a2a; color: #8c8;
      &:hover:not(:disabled) { background: #2a4a2a; }
    }
    .btn-empty {
      background: #3a1a1a; border: 1px solid #5a2a2a; color: #e88;
      &:hover:not(:disabled) { background: #4a2a2a; }
    }
    .photo-grid {
      flex: 1; overflow-y: auto;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--thumb-size, 160px), 1fr)); gap: 4px; align-content: start;
    }
    .photo-card {
      position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 4px; cursor: pointer; background: #222;
      img { width: 100%; height: 100%; object-fit: cover; opacity: 0.7; transition: opacity 0.15s; }
      &:hover img { opacity: 1; }
      &:hover .card-actions { opacity: 1; }
    }
    .card-actions {
      position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;
    }
    .card-btn {
      width: 28px; height: 28px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3);
      background: rgba(0,0,0,0.7); color: #fff; cursor: pointer; font-size: 0.85rem;
      display: flex; align-items: center; justify-content: center;
      &:hover { background: rgba(255,255,255,0.2); }
    }
    .card-btn-danger {
      color: #e88; border-color: #844;
      &:hover { background: rgba(255,100,100,0.2); }
    }
    .trash-date {
      position: absolute; bottom: 4px; left: 4px; right: 4px;
      font-size: 0.7rem; color: #ccc; background: rgba(0,0,0,0.5);
      padding: 2px 6px; border-radius: 3px; text-align: center;
    }
    .grid-loading, .empty { grid-column: 1/-1; text-align: center; padding: 40px; color: #666; }
  `],
})
export class TrashComponent implements OnInit, OnDestroy {
  photos: Photo[] = [];
  loading = false;
  working = false;
  totalPhotos = 0;
  totalSize = 0;
  page = 1;
  hasMore = true;
  selectedPhoto: Photo | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly selection: SelectionService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.selection.exitSelectionMode();
    this.load();
    this.loadStats();
  }

  ngOnDestroy(): void {
    // no-op
  }

  load(): void {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this.api.getTrash(this.page).subscribe({
      next: (r) => {
        this.photos.push(...r.photos);
        this.totalPhotos = r.pagination.total;
        this.hasMore = this.page < r.pagination.totalPages;
        this.page++;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  private loadStats(): void {
    this.api.getTrashStats().subscribe({
      next: (s) => {
        this.totalPhotos = s.count;
        this.totalSize = s.totalSize;
        this.cdr.detectChanges();
      },
    });
  }

  private reload(): void {
    this.photos = [];
    this.page = 1;
    this.hasMore = true;
    this.load();
    this.loadStats();
  }

  onScroll(e: Event): void {
    const el = e.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) this.load();
  }

  onPhotoClick(photo: Photo): void {
    this.selectedPhoto = photo;
  }

  closeLightbox(): void { this.selectedPhoto = null; }
  navigatePhoto(d: number): void {
    if (!this.selectedPhoto) return;
    const i = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id) + d;
    if (i >= 0 && i < this.photos.length) this.selectedPhoto = this.photos[i]!;
  }
  onImageError(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (img.src.endsWith('/ladybug.svg')) return;
    img.src = '/ladybug.svg';
  }

  restoreOne(photo: Photo): void {
    this.api.restorePhoto(photo.id).subscribe({
      next: () => {
        this.photos = this.photos.filter((p) => p.id !== photo.id);
        this.totalPhotos--;
        this.cdr.detectChanges();
        this.toast.success('Restored');
      },
      error: () => this.toast.error('Restore failed'),
    });
  }

  purgeOne(photo: Photo): void {
    if (!confirm('Permanently delete this photo? This cannot be undone.')) return;
    this.api.purgePhoto(photo.id).subscribe({
      next: () => {
        this.photos = this.photos.filter((p) => p.id !== photo.id);
        this.totalPhotos--;
        this.cdr.detectChanges();
        this.toast.success('Permanently deleted');
      },
      error: () => this.toast.error('Delete failed'),
    });
  }

  restoreAll(): void {
    if (!confirm(`Restore all ${this.totalPhotos} items from trash?`)) return;
    this.working = true;
    this.api.restoreAllTrash().subscribe({
      next: (res) => {
        this.working = false;
        this.toast.success(`Restored ${res.restored} items`);
        this.reload();
      },
      error: () => { this.working = false; this.toast.error('Restore-all failed'); },
    });
  }

  emptyTrash(): void {
    const sizeStr = this.totalSize > 0 ? ` (${this.formatSize(this.totalSize)})` : '';
    if (!confirm(`Permanently delete all ${this.totalPhotos} items${sizeStr}? This cannot be undone.`)) return;
    this.working = true;
    this.api.emptyTrash().subscribe({
      next: (res) => {
        this.working = false;
        this.toast.success(`Permanently deleted ${res.purged} items`);
        this.reload();
      },
      error: () => { this.working = false; this.toast.error('Empty trash failed'); },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}
