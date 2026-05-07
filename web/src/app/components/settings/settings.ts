import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { SettingsService } from '../../services/settings.service';
import type { CollectionStats } from '../../models/photo.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="settings-container">
      <h2>Settings</h2>

      <!-- Scan -->
      <div class="setting-section">
        <h3>Photo Scanning</h3>
        <p class="section-desc">
          Re-index scans the NAS for new or changed photos. Runs daily at 2 AM automatically.
        </p>
        @if (scanStatus) {
          <div class="status-row">
            <span class="status-label">Last scan:</span>
            <span class="status-value">
              {{ scanStatus.status }}
              @if (scanStatus.processed_files) {
                — {{ scanStatus.processed_files?.toLocaleString() }} / {{ scanStatus.total_files?.toLocaleString() }} files
              }
            </span>
          </div>
        }
      </div>

      <!-- Face Detection -->
      <div class="setting-section">
        <h3>Face Detection</h3>
        <p class="section-desc">
          Scan photos for faces, then cluster similar faces into people.
          Requires face-api.js models in the data directory.
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="runFaceScan()" [disabled]="faceScanRunning">
            {{ faceScanRunning ? 'Scanning...' : 'Scan for Faces' }}
          </button>
          @if (faceScanRunning) {
            <button class="btn-action btn-cancel" (click)="cancelFaceScan()">Cancel</button>
          }
          <button class="btn-action" (click)="runClustering()" [disabled]="clusteringRunning">
            {{ clusteringRunning ? 'Clustering...' : 'Cluster Faces' }}
          </button>
        </div>
        @if (faceScanResult) {
          <div class="result-msg">
            Scanned {{ faceScanResult.scanned }} photos, found {{ faceScanResult.facesFound }} faces
          </div>
        }
      </div>

      <!-- Inbox -->
      <div class="setting-section">
        <h3>Photo Ingestion</h3>
        <p class="section-desc">
          Drop photos into the inbox directory. They'll be hashed, deduplicated,
          and moved into the NAS folder structure.
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="triggerIngest()" [disabled]="ingestRunning">
            {{ ingestRunning ? 'Processing...' : 'Process Inbox' }}
          </button>
        </div>
        @if (ingestResult) {
          <div class="result-msg">
            Imported {{ ingestResult.imported }}, duplicates {{ ingestResult.duplicates }}, errors {{ ingestResult.errors }}
          </div>
        }
      </div>

      <!-- Navigation -->
      <div class="setting-section">
        <h3>Navigation</h3>
        <p class="section-desc">Choose which views appear in the sidebar.</p>
        <label class="toggle-row">
          <input
            type="checkbox"
            [checked]="settings['show_folders_nav'] !== 'false'"
            (change)="toggleSetting('show_folders_nav', $event)"
          />
          <span>Show Folders view</span>
        </label>
        <label class="toggle-row">
          <input
            type="checkbox"
            [checked]="settings['show_duplicates_nav'] !== 'false'"
            (change)="toggleSetting('show_duplicates_nav', $event)"
          />
          <span>Show Duplicates view</span>
        </label>
      </div>

      <!-- Cleanup -->
      <div class="setting-section">
        <h3>Pending Cleanup</h3>
        <p class="section-desc">
          Files removed from the index that may still exist on the NAS.
          These need manual deletion.
        </p>
        @if (cleanupItems.length === 0) {
          <div class="result-msg">No pending cleanup items</div>
        }
        @for (item of cleanupItems; track item.id) {
          <div class="cleanup-row">
            <span class="cleanup-path">{{ item.file_path }}</span>
            <span class="cleanup-reason">{{ item.reason }}</span>
            <button class="btn-small" (click)="clearCleanup(item.id)">Done</button>
          </div>
        }
      </div>

      <!-- Collection info -->
      @if (stats) {
        <div class="setting-section">
          <h3>Collection</h3>
          <div class="info-grid">
            <div>Total: {{ stats.total.toLocaleString() }}</div>
            <div>Images: {{ (stats.images ?? 0).toLocaleString() }}</div>
            <div>Videos: {{ (stats.videos ?? 0).toLocaleString() }}</div>
            <div>Size: {{ formatBytes(stats.totalSize ?? 0) }}</div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .settings-container {
      height: 100vh;
      overflow-y: auto;
      padding: 24px;
      max-width: 700px;

      h2 { margin: 0 0 24px; color: #ddd; font-size: 1.2rem; }
    }

    .setting-section {
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 16px;

      h3 { margin: 0 0 4px; color: #ccc; font-size: 0.95rem; }
    }

    .section-desc {
      margin: 0 0 12px;
      font-size: 0.8rem;
      color: #888;
      line-height: 1.4;
    }

    .status-row {
      font-size: 0.85rem;
      .status-label { color: #888; }
      .status-value { color: #aaa; margin-left: 4px; }
    }

    .action-row {
      display: flex;
      gap: 8px;
    }

    .btn-action {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #ddd;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;

      &:hover { background: #333; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
      &.btn-cancel { color: #e88; border-color: #844; &:hover { background: #3a1a1a; } }
    }

    .result-msg {
      margin-top: 10px;
      font-size: 0.8rem;
      color: #8c8;
    }

    .cleanup-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-top: 1px solid #2a2a2a;
      font-size: 0.8rem;

      .cleanup-path { flex: 1; color: #aaa; word-break: break-all; }
      .cleanup-reason { color: #666; }
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 0.85rem;
      color: #aaa;
      cursor: pointer;

      input { cursor: pointer; }
    }

    .btn-small {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #aaa;
      padding: 2px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;

      &:hover { background: #333; }
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      font-size: 0.85rem;
      color: #aaa;
    }
  `],
})
export class SettingsComponent implements OnInit {
  stats: CollectionStats | null = null;
  scanStatus: { status: string; processed_files?: number; total_files?: number } | null = null;
  cleanupItems: Array<{ id: number; file_path: string; reason: string }> = [];

  settings: Record<string, string> = {};

  faceScanRunning = false;
  faceScanResult: { scanned: number; facesFound: number } | null = null;
  clusteringRunning = false;
  ingestRunning = false;
  ingestResult: { imported: number; duplicates: number; errors: number } | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly settingsService: SettingsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getStats().subscribe({ next: (s) => { this.stats = s; this.cdr.detectChanges(); } });
    this.api.getScanStatus().subscribe({ next: (s) => { this.scanStatus = s; this.cdr.detectChanges(); } });
    this.api.getCleanupLog().subscribe({ next: (items) => { this.cleanupItems = items; this.cdr.detectChanges(); } });
    this.settingsService.settings$.subscribe((s) => { this.settings = s; this.cdr.detectChanges(); });
  }

  toggleSetting(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settingsService.set(key, checked ? 'true' : 'false');
  }

  cancelFaceScan(): void {
    this.api.cancelFaceScan().subscribe({
      next: () => {
        this.faceScanResult = { scanned: 0, facesFound: 0 };
        this.cdr.detectChanges();
      },
    });
  }

  runFaceScan(): void {
    this.faceScanRunning = true;
    this.faceScanResult = null;
    this.api.triggerFaceScan(50).subscribe({
      next: (result) => {
        this.faceScanResult = result;
        this.faceScanRunning = false;
        this.cdr.detectChanges();
      },
      error: () => { this.faceScanRunning = false; },
    });
  }

  runClustering(): void {
    this.clusteringRunning = true;
    this.api.triggerFaceClustering().subscribe({
      next: () => {
        this.clusteringRunning = false;
        this.cdr.detectChanges();
      },
      error: () => { this.clusteringRunning = false; },
    });
  }

  triggerIngest(): void {
    this.ingestRunning = true;
    this.ingestResult = null;
    this.api.triggerIngest().subscribe({
      next: (result) => {
        this.ingestResult = result;
        this.ingestRunning = false;
        this.cdr.detectChanges();
      },
      error: () => { this.ingestRunning = false; },
    });
  }

  clearCleanup(id: number): void {
    this.api.clearCleanupItem(id).subscribe({
      next: () => {
        this.cleanupItems = this.cleanupItems.filter((i) => i.id !== id);
        this.cdr.detectChanges();
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}
