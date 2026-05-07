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

      <!-- ═══════ PROCESSING JOBS ═══════ -->
      <div class="section-group">
        <h3 class="group-title">Processing Jobs</h3>
        <p class="group-desc">Background tasks that process your photo collection. Start, monitor, and cancel from here.</p>

        <!-- Photo Scanning -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128247;</span>
            <span class="job-name">Photo Scanning</span>
          </div>
          @if (scanStatus) {
            <div class="job-progress">
              {{ scanStatus.status }} — {{ scanStatus.processed_files?.toLocaleString() ?? 0 }} / {{ scanStatus.total_files?.toLocaleString() ?? 0 }} files
            </div>
          }
          <div class="job-desc">Re-index scans the NAS for new or changed photos. Runs daily at 2 AM.</div>
        </div>

        <!-- GPS Coordinates -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#127758;</span>
            <span class="job-name">GPS Coordinates</span>
            @if (gpsStatus?.running) { <span class="job-badge running">Running</span> }
          </div>
          @if (gpsStatus) {
            <div class="job-progress">
              {{ gpsStatus.found.toLocaleString() }} GPS found — {{ gpsStatus.checked.toLocaleString() }} / {{ gpsStatus.total.toLocaleString() }} checked
            </div>
            <div class="job-actions">
              <button class="btn-job" (click)="rescanGps()" [disabled]="gpsRunning">
                {{ gpsRunning ? 'Scanning...' : 'Re-scan GPS' }}
              </button>
              @if (gpsRunning) {
                <button class="btn-job btn-cancel" (click)="cancelGpsScan()">Cancel</button>
              }
            </div>
          }
        </div>

        <!-- Visual Similarity -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128269;</span>
            <span class="job-name">Visual Similarity</span>
            @if (embeddingStatus?.running) { <span class="job-badge running">Running</span> }
          </div>
          @if (embeddingStatus) {
            <div class="job-progress">
              {{ embeddingStatus.embedded.toLocaleString() }} / {{ embeddingStatus.total.toLocaleString() }} embedded ({{ embeddingStatus.remaining.toLocaleString() }} remaining)
            </div>
            <div class="job-actions">
              <button class="btn-job" (click)="runEmbeddingScan()" [disabled]="embeddingRunning">
                {{ embeddingRunning ? 'Generating...' : 'Generate Embeddings' }}
              </button>
              @if (embeddingRunning) {
                <button class="btn-job btn-cancel" (click)="cancelEmbedding()">Cancel</button>
              }
            </div>
          }
        </div>

        <!-- Thumbnails -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128444;</span>
            <span class="job-name">Thumbnails</span>
            @if (thumbsStatus?.running) { <span class="job-badge running">Running</span> }
          </div>
          @if (thumbsStatus) {
            <div class="job-progress">
              {{ thumbsStatus.generated.toLocaleString() }} generated — {{ thumbsStatus.checked.toLocaleString() }} / {{ thumbsStatus.total.toLocaleString() }} checked
            </div>
            <div class="job-actions">
              <button class="btn-job" (click)="generateThumbnails()" [disabled]="thumbsRunning">
                {{ thumbsRunning ? 'Generating...' : 'Generate Thumbnails' }}
              </button>
              @if (thumbsRunning) {
                <button class="btn-job btn-cancel" (click)="cancelThumbnails()">Cancel</button>
              }
            </div>
          }
        </div>

        <!-- Face Detection -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128100;</span>
            <span class="job-name">Face Detection</span>
            @if (faceScanRunning) { <span class="job-badge running">Running</span> }
          </div>
          @if (faceStatus) {
            <div class="job-progress">
              {{ faceStatus.faces.toLocaleString() }} faces found — {{ faceStatus.scanned.toLocaleString() }} / {{ faceStatus.total.toLocaleString() }} scanned
            </div>
          }
          <div class="job-actions">
            <button class="btn-job" (click)="runFaceScan()" [disabled]="faceScanRunning">
              {{ faceScanRunning ? 'Scanning...' : 'Scan for Faces' }}
            </button>
            @if (faceScanRunning) {
              <button class="btn-job btn-cancel" (click)="cancelFaceScan()">Cancel</button>
            }
            <button class="btn-job" (click)="runClustering()" [disabled]="clusteringRunning">
              {{ clusteringRunning ? 'Clustering...' : 'Cluster Faces' }}
            </button>
          </div>
        </div>

        <!-- Photo Ingestion -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128229;</span>
            <span class="job-name">Photo Ingestion</span>
          </div>
          <div class="job-desc">Process files dropped into the inbox directory.</div>
          <div class="job-actions">
            <button class="btn-job" (click)="triggerIngest()" [disabled]="ingestRunning">
              {{ ingestRunning ? 'Processing...' : 'Process Inbox' }}
            </button>
          </div>
          @if (ingestResult) {
            <div class="job-progress">
              Imported {{ ingestResult.imported }}, duplicates {{ ingestResult.duplicates }}, errors {{ ingestResult.errors }}
            </div>
          }
        </div>
      </div>

      <!-- ═══════ SCHEDULED JOBS ═══════ -->
      <div class="section-group">
        <h3 class="group-title">Scheduled Jobs</h3>

        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128339;</span>
            <span class="job-name">Daily Re-index</span>
            @if (cronStatus?.running) { <span class="job-badge running">Running</span> }
            @if (cronStatus && !cronStatus.enabled) { <span class="job-badge" style="background:#3a1a1a;border:1px solid #5a2a2a;color:#e88">Disabled</span> }
          </div>
          @if (cronStatus) {
            <div class="job-progress">
              Runs at {{ cronStatus.cronHour }}:00 daily — re-indexes photos, generates thumbnails, detects faces, creates embeddings
            </div>
            @if (cronStatus.nextRun) {
              <div class="job-desc">Next run: {{ cronStatus.nextRun | date:'medium' }}</div>
            }
            @if (cronStatus.lastRun) {
              <div class="job-desc">Last run: {{ cronStatus.lastRun | date:'medium' }}
                @if (cronStatus.lastResult) { — {{ cronStatus.lastResult }} }
              </div>
            }
            <div class="job-actions">
              <button class="btn-job" (click)="toggleCron()">
                {{ cronStatus.enabled ? 'Disable' : 'Enable' }}
              </button>
              <button class="btn-job" (click)="triggerCronNow()" [disabled]="cronStatus.running">
                Run Now
              </button>
              <label class="cron-hour">
                Hour:
                <select [value]="cronStatus.cronHour" (change)="setCronHour($event)">
                  @for (h of hours; track h) {
                    <option [value]="h">{{ h }}:00</option>
                  }
                </select>
              </label>
            </div>
          }
        </div>
      </div>

      <!-- ═══════ TOOLS ═══════ -->
      <div class="section-group">
        <h3 class="group-title">Tools</h3>

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

      <!-- Hidden Photos -->
      <div class="setting-section">
        <h3>Hidden Photos</h3>
        <p class="section-desc">
          Photos you've hidden are kept on disk but excluded from timeline, search, and albums.
        </p>
        <div class="action-row">
          <a href="/hidden" class="btn-action" style="text-decoration:none">View Hidden Photos</a>
        </div>
      </div>

      <!-- Database Backup -->
      <div class="setting-section">
        <h3>Database Backup</h3>
        <p class="section-desc">
          Download the SQLite database. Includes all metadata, albums, tags, faces, and settings.
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="downloadBackup()">Download Backup</button>
        </div>
      </div>

      </div>

      <!-- ═══════ PREFERENCES ═══════ -->
      <div class="section-group">
        <h3 class="group-title">Preferences</h3>

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

    .section-group {
      margin-bottom: 24px;
    }

    .group-title {
      margin: 0 0 4px;
      font-size: 1rem;
      color: #ddd;
      font-weight: 600;
    }

    .group-desc {
      margin: 0 0 12px;
      font-size: 0.8rem;
      color: #666;
    }

    .job-card {
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
    }

    .job-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .job-icon { font-size: 1.1rem; }
    .job-name { font-size: 0.9rem; color: #ddd; font-weight: 500; }

    .job-badge {
      font-size: 0.65rem;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-left: auto;

      &.running { background: #1a3a1a; border: 1px solid #2a5a2a; color: #8c8; }
    }

    .job-progress {
      font-size: 0.8rem;
      color: #888;
      margin-bottom: 6px;
    }

    .job-desc {
      font-size: 0.78rem;
      color: #666;
      margin-bottom: 6px;
    }

    .job-actions {
      display: flex;
      gap: 6px;
    }

    .btn-job {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #ddd;
      padding: 5px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;

      &:hover { background: #333; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
      &.btn-cancel { color: #e88; border-color: #844; &:hover { background: #3a1a1a; } }
    }

    .cron-hour {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: #aaa;
      margin-left: 8px;

      select {
        background: #222;
        border: 1px solid #444;
        color: #ddd;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
      }
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

  cronStatus: { enabled: boolean; running: boolean; cronHour: number; nextRun: string | null; lastRun: string | null; lastResult: string | null } | null = null;
  hours = Array.from({ length: 24 }, (_, i) => i);
  settings: Record<string, string> = {};
  dlnaRunning = false;
  tvAlbumId: number | null = null;

  faceScanRunning = true; // assume running until status confirms
  faceStatus: { running: boolean; total: number; scanned: number; faces: number; remaining: number } | null = null;
  private facePollTimer: ReturnType<typeof setInterval> | null = null;
  clusteringRunning = false;
  gpsRunning = true; // assume running until status confirms
  gpsStatus: { running: boolean; checked: number; found: number; total: number } | null = null;
  private gpsPollTimer: ReturnType<typeof setInterval> | null = null;
  embeddingRunning = true; // assume running until status confirms otherwise
  embeddingStatus: { running: boolean; total: number; embedded: number; remaining: number } | null = null;
  thumbsRunning = true; // assume running until status confirms
  thumbsStatus: { running: boolean; checked: number; generated: number; total: number } | null = null;
  private thumbsPollTimer: ReturnType<typeof setInterval> | null = null;
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
    this.refreshGpsStatus();
    this.refreshThumbsStatus();
    this.refreshFaceStatus();
    this.api.getCronStatus().subscribe({ next: (s) => { this.cronStatus = s; this.cdr.detectChanges(); } });
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

  private refreshGpsStatus(): void {
    this.api.getGpsScanStatus().subscribe({ next: (s) => {
      this.gpsStatus = s;
      this.gpsRunning = s.running;
      if (s.running && !this.gpsPollTimer) {
        this.gpsPollTimer = setInterval(() => this.refreshGpsStatus(), 3000);
      }
      if (!s.running && this.gpsPollTimer) {
        clearInterval(this.gpsPollTimer);
        this.gpsPollTimer = null;
      }
      this.cdr.detectChanges();
    }});
  }

  toggleCron(): void {
    if (!this.cronStatus) return;
    this.api.setCronEnabled(!this.cronStatus.enabled).subscribe({
      next: () => {
        this.api.getCronStatus().subscribe({ next: (s) => { this.cronStatus = s; this.cdr.detectChanges(); } });
      },
    });
  }

  triggerCronNow(): void {
    this.api.triggerCron().subscribe({
      next: () => {
        if (this.cronStatus) this.cronStatus.running = true;
        this.cdr.detectChanges();
      },
    });
  }

  setCronHour(event: Event): void {
    const hour = parseInt((event.target as HTMLSelectElement).value, 10);
    this.api.setCronHour(hour).subscribe({
      next: () => {
        this.api.getCronStatus().subscribe({ next: (s) => { this.cronStatus = s; this.cdr.detectChanges(); } });
      },
    });
  }

  rescanGps(): void {
    this.gpsRunning = true;
    this.api.rescanGps().subscribe();
    if (!this.gpsPollTimer) {
      this.gpsPollTimer = setInterval(() => this.refreshGpsStatus(), 3000);
    }
  }

  cancelGpsScan(): void {
    this.api.cancelGpsScan().subscribe({
      next: () => {
        this.gpsRunning = false;
        if (this.gpsPollTimer) { clearInterval(this.gpsPollTimer); this.gpsPollTimer = null; }
        this.refreshGpsStatus();
      },
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

  private refreshThumbsStatus(): void {
    this.api.getThumbnailScanStatus().subscribe({ next: (s) => {
      this.thumbsStatus = s;
      this.thumbsRunning = s.running;
      if (s.running && !this.thumbsPollTimer) {
        this.thumbsPollTimer = setInterval(() => this.refreshThumbsStatus(), 3000);
      }
      if (!s.running && this.thumbsPollTimer) {
        clearInterval(this.thumbsPollTimer);
        this.thumbsPollTimer = null;
      }
      this.cdr.detectChanges();
    }});
  }

  generateThumbnails(): void {
    this.thumbsRunning = true;
    this.api.generateMissingThumbnails().subscribe();
    if (!this.thumbsPollTimer) {
      this.thumbsPollTimer = setInterval(() => this.refreshThumbsStatus(), 3000);
    }
  }

  cancelThumbnails(): void {
    this.api.cancelThumbnailScan().subscribe({
      next: () => {
        this.thumbsRunning = false;
        if (this.thumbsPollTimer) { clearInterval(this.thumbsPollTimer); this.thumbsPollTimer = null; }
        this.refreshThumbsStatus();
      },
    });
  }

  private refreshFaceStatus(): void {
    this.api.getFaceScanStatus().subscribe({ next: (s) => {
      this.faceStatus = s;
      this.faceScanRunning = s.running;
      if (s.running && !this.facePollTimer) {
        this.facePollTimer = setInterval(() => this.refreshFaceStatus(), 3000);
      }
      if (!s.running && this.facePollTimer) {
        clearInterval(this.facePollTimer);
        this.facePollTimer = null;
      }
      this.cdr.detectChanges();
    }});
  }

  cancelFaceScan(): void {
    this.api.cancelFaceScan().subscribe({
      next: () => {
        this.faceScanRunning = false;
        if (this.facePollTimer) { clearInterval(this.facePollTimer); this.facePollTimer = null; }
        this.refreshFaceStatus();
      },
    });
  }

  runFaceScan(): void {
    this.faceScanRunning = true;
    this.api.triggerFaceScan(50).subscribe();
    if (!this.facePollTimer) {
      this.facePollTimer = setInterval(() => this.refreshFaceStatus(), 3000);
    }
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
