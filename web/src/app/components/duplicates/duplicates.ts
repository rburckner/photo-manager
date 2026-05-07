import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

interface DuplicateGroup {
  file_hash: string;
  count: number;
  photos: Array<{ id: number; file_path: string; file_size: number; mime_type: string }>;
  keepId: number | null;
}

@Component({
  selector: 'app-duplicates',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="duplicates-container">
      <div class="dup-header">
        <h2>Duplicate Detection</h2>
        <span class="dup-summary">{{ groups.length }} duplicate groups found</span>
      </div>

      @if (loading) {
        <div class="loading">Scanning for duplicates...</div>
      }

      @if (!loading && groups.length === 0) {
        <div class="empty">No duplicates found. Your collection is clean.</div>
      }

      @for (group of groups; track group.file_hash) {
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
                <img
                  [src]="api.getThumbnailUrl(photo.id)"
                  class="dup-thumb"
                  (error)="onImageError($event)"
                />
                <div class="file-info">
                  <div class="file-path">{{ photo.file_path }}</div>
                  <div class="file-meta">
                    {{ photo.mime_type }} &middot; {{ formatBytes(photo.file_size) }}
                  </div>
                </div>
                <div class="file-actions">
                  @if (group.keepId === null) {
                    <button class="btn-keep" (click)="markKeep(group, photo.id)">Keep this</button>
                  } @else if (group.keepId === photo.id) {
                    <span class="keep-badge">Keeping</span>
                    <button class="btn-undo" (click)="group.keepId = null">Undo</button>
                  } @else {
                    <button class="btn-remove" (click)="confirmRemove(group, photo.id)">
                      Remove from index
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      @if (groups.length > 0) {
        <div class="dup-footer">
          <p>
            Note: "Remove from index" only removes the entry from the database.
            Files on the NAS are read-only and are never deleted by this application.
          </p>
        </div>
      }
    </div>
  `,
  styles: [`
    .duplicates-container {
      height: 100vh;
      overflow-y: auto;
      padding: 20px;

      h2 { margin: 0; color: #ddd; font-size: 1.2rem; }
    }

    .dup-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 20px;
    }

    .dup-summary { font-size: 0.8rem; color: #888; }
    .loading, .empty { text-align: center; padding: 40px; color: #666; }

    .dup-group {
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .group-header {
      padding: 10px 16px;
      background: #252525;
      display: flex;
      gap: 12px;
      align-items: center;

      .hash { font-family: monospace; font-size: 0.8rem; color: #888; }
      .count { font-size: 0.75rem; color: #e88; }
    }

    .file-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      border-top: 1px solid #2a2a2a;
      transition: background 0.15s;

      &.keep { background: rgba(50, 120, 50, 0.1); }
      &.remove { opacity: 0.5; }
    }

    .dup-thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 4px;
      flex-shrink: 0;
      background: #222;
    }

    .file-info { flex: 1; min-width: 0; }
    .file-path { font-size: 0.8rem; color: #ccc; word-break: break-all; }
    .file-meta { font-size: 0.7rem; color: #666; margin-top: 2px; }

    .file-actions {
      display: flex; gap: 6px; align-items: center; flex-shrink: 0;
    }

    .btn-keep, .btn-remove, .btn-undo {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid;
      cursor: pointer;
      font-size: 0.75rem;
    }

    .btn-keep {
      background: rgba(50,120,50,0.2); border-color: #4a4; color: #8c8;
      &:hover { background: rgba(50,120,50,0.3); }
    }

    .btn-remove {
      background: rgba(120,50,50,0.2); border-color: #844; color: #e88;
      &:hover { background: rgba(120,50,50,0.3); }
    }

    .btn-undo {
      background: none; border-color: #444; color: #aaa;
      &:hover { background: #2a2a2a; }
    }

    .keep-badge {
      font-size: 0.75rem; color: #8c8; font-weight: 500;
    }

    .dup-footer {
      padding: 20px;
      text-align: center;
      p { font-size: 0.8rem; color: #666; }
    }
  `],
})
export class DuplicatesComponent implements OnInit {
  groups: DuplicateGroup[] = [];
  loading = true;

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getDuplicates().subscribe({
      next: (data) => {
        this.groups = data.map((g) => ({ ...g, keepId: null }));
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; },
    });
  }

  markKeep(group: DuplicateGroup, id: number): void {
    group.keepId = id;
  }

  confirmRemove(group: DuplicateGroup, id: number): void {
    const path = group.photos.find((p) => p.id === id)?.file_path ?? '';
    if (!confirm(`Remove "${path}" from the index?\n\nThe file on the NAS will NOT be deleted.`)) return;

    this.api.removeFromIndex(id).subscribe({
      next: () => {
        group.photos = group.photos.filter((p) => p.id !== id);
        group.count = group.photos.length;
        if (group.photos.length <= 1) {
          this.groups = this.groups.filter((g) => g !== group);
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

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
