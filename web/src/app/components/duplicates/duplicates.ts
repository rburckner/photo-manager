import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';

interface ExactGroup {
  file_hash: string;
  count: number;
  photos: Array<{ id: number; file_path: string; file_size: number; mime_type: string }>;
  keepId: number | null;
}

interface NearPhoto {
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
}

interface NearCluster {
  representative_id: number;
  photos: NearPhoto[];
}

@Component({
  selector: 'app-duplicates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="duplicates-container">
      <div class="dup-header">
        <h2>Duplicate Detection</h2>
        <div class="mode-tabs">
          <button class="tab" [class.active]="mode === 'exact'" (click)="switchMode('exact')">Exact</button>
          <button class="tab" [class.active]="mode === 'near'" (click)="switchMode('near')">Near (visual)</button>
        </div>
      </div>

      @if (mode === 'exact') {
        <div class="dup-summary-row">
          <span class="dup-summary">{{ exactGroups.length }} duplicate groups found</span>
        </div>
        @if (exactLoading) { <div class="loading">Scanning for duplicates...</div> }
        @if (!exactLoading && exactGroups.length === 0) {
          <div class="empty">No exact duplicates. Your collection is clean.</div>
        }

        @for (group of exactGroups; track group.file_hash) {
          <div class="dup-group">
            <div class="group-header">
              <span class="hash">{{ group.file_hash.slice(0, 12) }}...</span>
              <span class="count">{{ group.count }} copies</span>
            </div>
            <div class="group-files">
              @for (photo of group.photos; track photo.id) {
                <div
                  class="file-row"
                  [class.keep]="group.keepId === photo.id"
                  [class.remove]="group.keepId !== null && group.keepId !== photo.id"
                >
                  <img [src]="api.getThumbnailUrl(photo.id)" class="dup-thumb" (error)="onImageError($event)" />
                  <div class="file-info">
                    <div class="file-path">{{ photo.file_path }}</div>
                    <div class="file-meta">{{ photo.mime_type }} &middot; {{ formatBytes(photo.file_size) }}</div>
                  </div>
                  <div class="file-actions">
                    @if (group.keepId === null) {
                      <button class="btn-keep" (click)="markKeep(group, photo.id)">Keep this</button>
                    } @else if (group.keepId === photo.id) {
                      <span class="keep-badge">Keeping</span>
                      <button class="btn-undo" (click)="group.keepId = null">Undo</button>
                    } @else {
                      <button class="btn-remove" (click)="confirmRemoveExact(group, photo.id)">Remove from index</button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        @if (exactGroups.length > 0) {
          <div class="dup-footer">
            <p>Note: "Remove from index" only removes the entry from the database. Files on the NAS are not deleted.</p>
          </div>
        }
      }

      @if (mode === 'near') {
        <div class="near-controls">
          <label class="distance-control">
            <span>Similarity (lower = stricter):</span>
            <input
              type="range"
              min="0"
              max="7"
              step="1"
              [(ngModel)]="distance"
              (change)="loadNear()"
            />
            <span class="distance-value">{{ distance }}</span>
          </label>
          <div class="status">
            @if (phashStatus && phashStatus.total > 0) {
              <span class="hash-coverage">
                {{ phashStatus.checked }} / {{ phashStatus.total }} hashed
                @if (phashStatus.running) { (running) }
              </span>
            }
            @if (!phashScanning && nearTotal !== null && nearTotal === 0) {
              <button class="btn-rehash" (click)="startPhashScan()">Compute hashes</button>
            } @else if (phashScanning) {
              <button class="btn-rehash" (click)="cancelPhashScan()">Cancel</button>
            }
          </div>
        </div>

        @if (nearLoading) { <div class="loading">Finding similar photos...</div> }
        @if (!nearLoading && nearTotal !== null && nearTotal === 0) {
          <div class="empty">
            No photos have perceptual hashes yet.
            Click "Compute hashes" to start. (Runs in the background; daily cron also fills these in.)
          </div>
        }
        @if (!nearLoading && nearTotal !== null && nearTotal > 0 && nearClusters.length === 0) {
          <div class="empty">No near-duplicates found at distance {{ distance }}. Try a higher distance for looser matching.</div>
        }

        @for (cluster of nearClusters; track cluster.representative_id) {
          <div class="dup-group">
            <div class="group-header">
              <span class="hash">cluster {{ cluster.representative_id }}</span>
              <span class="count">{{ cluster.photos.length }} similar</span>
            </div>
            <div class="near-grid">
              @for (photo of cluster.photos; track photo.id) {
                <div class="near-card">
                  <img [src]="api.getThumbnailUrl(photo.id)" class="near-thumb" (error)="onImageError($event)" />
                  <div class="near-info">
                    <div class="file-name" [title]="photo.file_path">{{ photo.file_name }}</div>
                    <div class="file-meta">
                      {{ photo.width }}&times;{{ photo.height }} &middot; {{ formatBytes(photo.file_size) }}
                      @if (photo.date_taken) { &middot; {{ photo.date_taken.slice(0, 10) }} }
                    </div>
                  </div>
                  <button class="btn-trash" (click)="trashOne(photo.id)" title="Move to trash">&#128465;</button>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .duplicates-container { height: 100vh; overflow-y: auto; padding: 20px; }
    h2 { margin: 0; color: #ddd; font-size: 1.2rem; }

    .dup-header {
      display: flex; align-items: baseline; gap: 16px; margin-bottom: 16px;
    }
    .mode-tabs { display: flex; gap: 4px; }
    .tab {
      background: #1e1e1e; border: 1px solid #333; color: #888;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
      &:hover { background: #252525; color: #ccc; }
      &.active { background: #2a3a5a; border-color: #3a5a8a; color: #fff; }
    }

    .dup-summary-row { margin-bottom: 12px; }
    .dup-summary { font-size: 0.8rem; color: #888; }
    .loading, .empty { text-align: center; padding: 40px; color: #666; }

    .near-controls {
      display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
      padding: 12px; background: #1e1e1e; border: 1px solid #333; border-radius: 8px;
      flex-wrap: wrap;
    }
    .distance-control {
      display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #aaa;
      input[type="range"] { width: 120px; }
      .distance-value { font-family: monospace; min-width: 1.5rem; text-align: center; color: #fff; }
    }
    .status { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 0.8rem; color: #888; }
    .btn-rehash {
      background: #2a3a5a; border: 1px solid #3a5a8a; color: #ccd;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
      &:hover { background: #3a4a6a; }
    }

    .dup-group {
      background: #1e1e1e; border: 1px solid #333; border-radius: 8px;
      margin-bottom: 12px; overflow: hidden;
    }
    .group-header {
      padding: 10px 16px; background: #252525; display: flex; gap: 12px; align-items: center;
      .hash { font-family: monospace; font-size: 0.8rem; color: #888; }
      .count { font-size: 0.75rem; color: #e88; }
    }

    .file-row {
      display: flex; align-items: center; gap: 12px; padding: 8px 16px;
      border-top: 1px solid #2a2a2a; transition: background 0.15s;
      &.keep { background: rgba(50, 120, 50, 0.1); }
      &.remove { opacity: 0.5; }
    }
    .dup-thumb {
      width: 48px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; background: #222;
    }
    .file-info { flex: 1; min-width: 0; }
    .file-path { font-size: 0.8rem; color: #ccc; word-break: break-all; }
    .file-meta { font-size: 0.7rem; color: #666; margin-top: 2px; }
    .file-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

    .btn-keep, .btn-remove, .btn-undo {
      padding: 4px 12px; border-radius: 4px; border: 1px solid; cursor: pointer; font-size: 0.75rem;
    }
    .btn-keep { background: rgba(50,120,50,0.2); border-color: #4a4; color: #8c8; &:hover { background: rgba(50,120,50,0.3); } }
    .btn-remove { background: rgba(120,50,50,0.2); border-color: #844; color: #e88; &:hover { background: rgba(120,50,50,0.3); } }
    .btn-undo { background: #2a2a2a; border-color: #444; color: #888; &:hover { color: #ccc; } }
    .keep-badge { font-size: 0.7rem; color: #8c8; }

    .near-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;
      padding: 12px;
    }
    .near-card {
      background: #252525; border-radius: 6px; overflow: hidden; position: relative;
    }
    .near-thumb {
      width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #1a1a1a;
    }
    .near-info { padding: 8px; }
    .file-name { font-size: 0.8rem; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .btn-trash {
      position: absolute; top: 6px; right: 6px;
      background: rgba(0,0,0,0.7); border: 1px solid #844; color: #e88;
      width: 32px; height: 32px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;
      &:hover { background: rgba(120,50,50,0.5); }
    }

    .dup-footer { padding: 20px; text-align: center; p { font-size: 0.8rem; color: #666; } }
  `],
})
export class DuplicatesComponent implements OnInit, OnDestroy {
  mode: 'exact' | 'near' = 'exact';

  // Exact mode state
  exactGroups: ExactGroup[] = [];
  exactLoading = false;

  // Near mode state
  distance = 5;
  nearClusters: NearCluster[] = [];
  nearLoading = false;
  nearTotal: number | null = null;
  phashScanning = false;
  phashStatus: { running: boolean; checked: number; hashed: number; total: number } | null = null;
  private phashPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadExact();
  }

  ngOnDestroy(): void {
    if (this.phashPollTimer) clearInterval(this.phashPollTimer);
  }

  switchMode(m: 'exact' | 'near'): void {
    this.mode = m;
    if (m === 'near' && this.nearTotal === null) {
      this.loadNear();
    }
  }

  // ── Exact mode ──
  loadExact(): void {
    this.exactLoading = true;
    this.api.getDuplicates().subscribe({
      next: (data) => {
        this.exactGroups = data.map((g) => ({ ...g, keepId: null }));
        this.exactLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.exactLoading = false; this.cdr.detectChanges(); },
    });
  }

  markKeep(group: ExactGroup, id: number): void { group.keepId = id; }

  confirmRemoveExact(group: ExactGroup, id: number): void {
    const path = group.photos.find((p) => p.id === id)?.file_path ?? '';
    if (!confirm(`Remove "${path}" from the index?\n\nThe file on the NAS will NOT be deleted.`)) return;

    this.api.removeFromIndex(id).subscribe({
      next: () => {
        group.photos = group.photos.filter((p) => p.id !== id);
        group.count = group.photos.length;
        if (group.photos.length <= 1) {
          this.exactGroups = this.exactGroups.filter((g) => g !== group);
        }
        this.cdr.detectChanges();
      },
    });
  }

  // ── Near mode ──
  loadNear(): void {
    this.nearLoading = true;
    this.api.getPerceptualDuplicates(this.distance).subscribe({
      next: (data) => {
        this.nearClusters = data.clusters;
        this.nearTotal = data.total_with_hash;
        this.nearLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.nearLoading = false; this.cdr.detectChanges(); },
    });
    this.refreshPhashStatus();
  }

  trashOne(id: number): void {
    this.api.trashPhoto(id).subscribe({
      next: (res) => {
        if (!res.moved) { this.toast.error('Move to trash failed'); return; }
        // Optimistic UI: remove from all clusters
        this.nearClusters = this.nearClusters
          .map((c) => ({ ...c, photos: c.photos.filter((p) => p.id !== id) }))
          .filter((c) => c.photos.length >= 2);
        this.cdr.detectChanges();
        this.toast.withAction('Moved to trash', 'Undo', () => {
          this.api.restorePhoto(id).subscribe({
            next: () => this.loadNear(),
            error: () => this.toast.error('Restore failed'),
          });
        });
      },
      error: () => this.toast.error('Move to trash failed'),
    });
  }

  startPhashScan(): void {
    this.api.startPerceptualHashScan().subscribe({
      next: () => {
        this.phashScanning = true;
        this.toast.info('Computing perceptual hashes in the background...');
        this.startPhashPolling();
      },
      error: () => this.toast.error('Could not start hash scan'),
    });
  }

  cancelPhashScan(): void {
    this.api.cancelPerceptualHashScan().subscribe({
      next: () => {
        this.phashScanning = false;
        this.stopPhashPolling();
      },
    });
  }

  private startPhashPolling(): void {
    this.refreshPhashStatus();
    this.phashPollTimer = setInterval(() => this.refreshPhashStatus(), 2000);
  }

  private stopPhashPolling(): void {
    if (this.phashPollTimer) {
      clearInterval(this.phashPollTimer);
      this.phashPollTimer = null;
    }
  }

  private refreshPhashStatus(): void {
    this.api.getPerceptualHashStatus().subscribe({
      next: (s) => {
        this.phashStatus = s;
        this.phashScanning = s.running;
        if (!s.running && this.phashPollTimer) {
          this.stopPhashPolling();
          this.loadNear();
        }
        this.cdr.detectChanges();
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  onImageError(event: Event): void { (event.target as HTMLImageElement).style.display = 'none'; }
}
