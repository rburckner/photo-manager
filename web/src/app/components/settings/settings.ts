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

      <!-- Date Management -->
      <div class="setting-section">
        <h3>Date Management</h3>
        <p class="section-desc">
          Fix photos with missing or incorrect dates by dragging them to the correct month.
        </p>
        <div class="action-row">
          <a href="/fix-dates" class="btn-action" style="text-decoration:none">
            Open Fix Dates Tool
          </a>
        </div>
      </div>

      <!-- TV Services -->
      <div class="setting-section">
        <h3>TV Services</h3>
        <p class="section-desc">
          DLNA allows smart TVs to discover and browse your photos automatically.
          The slideshow is accessible at <a href="/tv" target="_blank">/tv</a>.
        </p>
        <div class="action-row">
          <button
            class="btn-action"
            [class.btn-active]="dlnaRunning"
            (click)="toggleDlna()"
          >
            DLNA: {{ dlnaRunning ? 'Running' : 'Stopped' }}
          </button>
          <a href="/tv" target="_blank" class="btn-action" style="text-decoration:none">
            Open TV Slideshow
          </a>
        </div>
        @if (tvAlbumId) {
          <div class="status-row" style="margin-top: 8px">
            <span class="status-label">Default album:</span>
            <span class="status-value">TV Slideshow (id: {{ tvAlbumId }})</span>
          </div>
          <div class="status-row">
            <span class="status-label">TV URL with album:</span>
            <span class="status-value"><code>/tv?album={{ tvAlbumId }}</code></span>
          </div>
        }
      </div>

      <!-- GPS Re-scan -->
      <div class="setting-section">
        <h3>GPS Coordinates</h3>
        <p class="section-desc">
          Re-extract GPS data from photos. Use this after fixing the GPS parser
          to populate coordinates for photos that were previously missed.
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="rescanGps()" [disabled]="gpsRunning">
            {{ gpsRunning ? 'Scanning...' : 'Re-scan GPS Data' }}
          </button>
        </div>
        @if (gpsResult) {
          <div class="result-msg">
            Checked {{ gpsResult.checked }}, found GPS in {{ gpsResult.gpsFound }} photos
          </div>
        }
      </div>

      <!-- Visual Similarity -->
      <div class="setting-section">
        <h3>Visual Similarity</h3>
        <p class="section-desc">
          Generate image embeddings using MobileNet. Once embedded, "Find Similar" in the
          lightbox will find photos that look visually alike — regardless of date or metadata.
          First run downloads the model (~16MB) from TensorFlow Hub.
        </p>
        @if (embeddingStatus) {
          <div class="status-row">
            <span class="status-label">Progress:</span>
            <span class="status-value">{{ embeddingStatus.embedded.toLocaleString() }} / {{ embeddingStatus.total.toLocaleString() }} photos embedded ({{ embeddingStatus.remaining.toLocaleString() }} remaining)</span>
          </div>
          @if (embeddingStatus.running) {
            <div class="status-row">
              <span class="status-value" style="color: #8c8">Embedding scan is running...</span>
            </div>
          }
        }
        @if (embeddingStatus) {
          <div class="action-row" style="margin-top: 8px">
            <button class="btn-action" (click)="runEmbeddingScan()" [disabled]="embeddingRunning">
              {{ embeddingRunning ? 'Generating...' : 'Generate Embeddings' }}
            </button>
            @if (embeddingRunning) {
              <button class="btn-action btn-cancel" (click)="cancelEmbedding()">Cancel</button>
            }
          </div>
        }
        @if (!embeddingRunning && embeddingStatus && embeddingStatus.remaining === 0) {
          <div class="result-msg">
            All photos embedded
          </div>
        }
      </div>

      <!-- Thumbnails -->
      <div class="setting-section">
        <h3>Thumbnails</h3>
        <p class="section-desc">
          Generate missing thumbnails for photos and videos (requires ffmpeg for videos).
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="generateThumbnails()" [disabled]="thumbsRunning">
            {{ thumbsRunning ? 'Generating...' : 'Generate Missing Thumbnails' }}
          </button>
        </div>
        @if (thumbsResult) {
          <div class="result-msg">
            Checked {{ thumbsResult.checked }}, generated {{ thumbsResult.generated }} thumbnails
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

      <!-- Hidden Photos -->
      <div class="setting-section">
        <h3>Hidden Photos</h3>
        <p class="section-desc">
          Photos you've hidden are kept on disk but excluded from timeline, search, and albums.
          View and manage them here.
        </p>
        <div class="action-row">
          <a href="/hidden" class="btn-action" style="text-decoration:none">
            View Hidden Photos
          </a>
        </div>
      </div>

      <!-- Database Backup -->
      <div class="setting-section">
        <h3>Database Backup</h3>
        <p class="section-desc">
          Download the SQLite database file. Includes all photo metadata, albums, tags, faces, and settings.
          Does not include thumbnails or original photos.
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="downloadBackup()">Download Backup</button>
        </div>
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
      &.btn-active { background: #1a3a1a; border-color: #2a5a2a; color: #8c8; }
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
  dlnaRunning = false;
  tvAlbumId: number | null = null;

  faceScanRunning = false;
  faceScanResult: { scanned: number; facesFound: number } | null = null;
  clusteringRunning = false;
  gpsRunning = false;
  gpsResult: { checked: number; gpsFound: number } | null = null;
  embeddingRunning = true; // assume running until status confirms otherwise
  embeddingStatus: { running: boolean; total: number; embedded: number; remaining: number } | null = null;
  thumbsRunning = false;
  thumbsResult: { checked: number; generated: number } | null = null;
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
    this.refreshEmbeddingStatus();
    this.api.getTvStatus().subscribe({ next: (s) => { this.dlnaRunning = s.dlna.running; this.cdr.detectChanges(); } });
    this.api.getAlbums().subscribe({ next: (albums) => {
      const tv = albums.find((a: { name: string }) => a.name === 'TV Slideshow');
      if (tv) this.tvAlbumId = tv.id;
      this.cdr.detectChanges();
    }});
  }

  toggleSetting(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settingsService.set(key, checked ? 'true' : 'false');
  }

  private embeddingPollTimer: ReturnType<typeof setInterval> | null = null;

  private refreshEmbeddingStatus(): void {
    this.api.getEmbeddingStatus().subscribe({ next: (s) => {
      this.embeddingStatus = s;
      this.embeddingRunning = s.running;

      // Start polling if running, stop if not
      if (s.running && !this.embeddingPollTimer) {
        this.embeddingPollTimer = setInterval(() => this.refreshEmbeddingStatus(), 3000);
      }
      if (!s.running && this.embeddingPollTimer) {
        clearInterval(this.embeddingPollTimer);
        this.embeddingPollTimer = null;
      }
      this.cdr.detectChanges();
    }});
  }

  rescanGps(): void {
    this.gpsRunning = true;
    this.gpsResult = null;
    this.api.rescanGps(1000).subscribe({
      next: (r) => { this.gpsResult = r; this.gpsRunning = false; this.cdr.detectChanges(); },
      error: () => { this.gpsRunning = false; },
    });
  }

  runEmbeddingScan(): void {
    this.embeddingRunning = true;
    this.api.runEmbeddingScan(50).subscribe();
    // Start polling status
    if (!this.embeddingPollTimer) {
      this.embeddingPollTimer = setInterval(() => this.refreshEmbeddingStatus(), 3000);
    }
  }

  cancelEmbedding(): void {
    this.api.cancelEmbeddingScan().subscribe({
      next: () => {
        this.embeddingRunning = false;
        if (this.embeddingPollTimer) {
          clearInterval(this.embeddingPollTimer);
          this.embeddingPollTimer = null;
        }
        this.refreshEmbeddingStatus();
      },
    });
  }

  downloadBackup(): void {
    this.api.downloadBackup();
  }

  toggleDlna(): void {
    const action = this.dlnaRunning ? this.api.stopDlna() : this.api.startDlna();
    action.subscribe({
      next: () => {
        this.dlnaRunning = !this.dlnaRunning;
        this.cdr.detectChanges();
      },
    });
  }

  generateThumbnails(): void {
    this.thumbsRunning = true;
    this.thumbsResult = null;
    this.api.generateMissingThumbnails(200).subscribe({
      next: (result) => {
        this.thumbsResult = result;
        this.thumbsRunning = false;
        this.cdr.detectChanges();
      },
      error: () => { this.thumbsRunning = false; },
    });
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
