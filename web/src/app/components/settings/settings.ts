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

      <!-- ═══════ NAS HEALTH ═══════ -->
      @if (health) {
        <div class="nas-health" [class]="'state-' + health.nas.state">
          <span class="nas-dot"></span>
          <span class="nas-label">NAS:</span>
          <span class="nas-state">{{ nasStateLabel(health.nas.state) }}</span>
          <span class="nas-path">{{ health.nas.mediaRoot }}</span>
          @if (health.nas.state !== 'rw' && health.nas.state !== 'unknown') {
            <span class="nas-hint">Photos may not load until this is fixed.</span>
          }
        </div>
      }

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
              @if (gpsStatus.running) {
                {{ gpsStatus.checked.toLocaleString() }} / {{ gpsStatus.total.toLocaleString() }} scanned — {{ gpsStatus.found.toLocaleString() }} new geotag(s)
              } @else {
                {{ gpsStatus.withGps.toLocaleString() }} geotagged — {{ gpsStatus.withoutGps.toLocaleString() }} without GPS
              }
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

        <!-- Photo Dates -->
        <div class="job-card">
          <div class="job-header">
            <span class="job-icon">&#128197;</span>
            <span class="job-name">Photo Dates</span>
            @if (datesStatus?.running) { <span class="job-badge running">Running</span> }
          </div>
          <div class="job-desc">
            Re-extracts EXIF from every image and writes any date it finds back to the DB. Files whose EXIF still has no date keep your manually-set Fix Dates values.
          </div>
          @if (datesStatus) {
            <div class="job-progress">
              @if (datesStatus.running) {
                {{ datesStatus.checked.toLocaleString() }} / {{ datesStatus.total.toLocaleString() }} scanned — {{ datesStatus.updated.toLocaleString() }} date(s) updated
              } @else {
                {{ datesStatus.total.toLocaleString() }} images indexed
              }
            </div>
            <div class="job-actions">
              <button class="btn-job" (click)="rescanDates()" [disabled]="datesRunning">
                {{ datesRunning ? 'Scanning...' : 'Re-scan dates from EXIF' }}
              </button>
              @if (datesRunning) {
                <button class="btn-job btn-cancel" (click)="cancelDatesScan()">Cancel</button>
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
          @if (clusteringResult) {
            <div class="job-progress cluster-result">
              @if (clusteringResult.newPeople > 0) {
                Created {{ clusteringResult.newPeople.toLocaleString() }} new
                {{ clusteringResult.newPeople === 1 ? 'person' : 'people' }}
                covering {{ clusteringResult.photosCovered.toLocaleString() }} photos.
                Review them on the People page.
              } @else {
                No new clusters formed — remaining unassigned faces aren't
                similar enough to each other (under the 0.6 threshold) to group.
              }
            </div>
          }
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

      <!-- TV Services -->
      <div class="setting-section">
        <h3>TV Services</h3>
        <p class="section-desc">
          DLNA lets smart TVs discover and browse your photos. The slideshow is at
          <a href="/tv" target="_blank">/tv</a>. Both serve every non-hidden photo
          inside the date window below — leave a bound empty for "no limit" on that side.
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
        <div class="tv-date-range">
          <label class="toggle-row">
            <span>From</span>
            <input
              type="month"
              [value]="tvFromMonth"
              (change)="onTvFromChange($event)"
              class="date-input"
            />
          </label>
          <label class="toggle-row">
            <span>To</span>
            <input
              type="month"
              [value]="tvToMonth"
              (change)="onTvToChange($event)"
              class="date-input"
            />
          </label>
          @if (tvFromMonth || tvToMonth) {
            <button class="btn-action" (click)="clearTvDateRange()">Clear range</button>
          }
        </div>
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

      <!-- Database Backup & Restore -->
      <div class="setting-section">
        <h3>Database Backup &amp; Restore</h3>
        <p class="section-desc">
          Download or restore the SQLite database. Includes all metadata, albums, tags, faces, and settings.
        </p>
        <div class="action-row">
          <button class="btn-action" (click)="downloadBackup()">Download Backup</button>
          <label class="btn-action" style="cursor:pointer">
            Restore from Backup
            <input type="file" accept=".db,.sqlite,.sqlite3" style="display:none" (change)="restoreBackup($event)" />
          </label>
        </div>
        @if (restoreMessage) {
          <div class="result-msg">{{ restoreMessage }}</div>
        }
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
        <label class="toggle-row">
          <input
            type="checkbox"
            [checked]="settings['show_screenshots_nav'] === 'true'"
            (change)="toggleSetting('show_screenshots_nav', $event)"
          />
          <span>Show Memes &amp; Screenshots view</span>
        </label>
        <label class="toggle-row">
          <input
            type="checkbox"
            [checked]="settings['show_no_people_nav'] === 'true'"
            (change)="toggleSetting('show_no_people_nav', $event)"
          />
          <span>Show "Photos without people" view</span>
        </label>
      </div>

      <!-- Privacy / hidden override -->
      <div class="setting-section">
        <h3>Hidden content</h3>
        <p class="section-desc">
          Photos can be hidden two ways: by selecting them and choosing Hide, or by
          marking a person as hidden in the People view (which hides every photo with
          that person's face). Toggle this on to temporarily reveal both kinds — useful
          when searching for a specific moment. Trashed photos are never affected.
        </p>
        <label class="toggle-row">
          <input
            type="checkbox"
            [checked]="settings['show_hidden'] === 'true'"
            (change)="toggleSetting('show_hidden', $event)"
          />
          <span>Temporarily show hidden photos and people</span>
        </label>
      </div>

      <!-- Trash -->
      <div class="setting-section">
        <h3>Trash</h3>
        <p class="section-desc">
          How long deleted photos stay in the trash before being permanently removed.
          Daily cleanup runs at the same time as the re-index.
        </p>
        <label class="toggle-row">
          <span>Retention (days)</span>
          <input
            type="number"
            min="1"
            max="365"
            class="number-input"
            [value]="settings['trash_retention_days'] || '30'"
            (change)="setRetentionDays($event)"
          />
        </label>
      </div>

      <!-- Devices (phone pairing for upload) -->
      <div class="setting-section">
        <h3>Paired devices</h3>
        <p class="section-desc">
          Pair a phone or other device to upload photos. The device opens this
          server in a browser, navigates to /pair, and enters the 6-digit code
          you generate here.
        </p>
        @if (pairingCode) {
          <div class="pair-code-box">
            <span class="pair-code">{{ pairingCode }}</span>
            <span class="pair-hint">Enter on your device within 5 minutes.</span>
          </div>
        }
        <button class="btn-small" (click)="generatePairingCode()">Generate pairing code</button>

        @if (devices.length > 0) {
          <div class="devices-list">
            @for (d of devices; track d.id) {
              <div class="device-row">
                <span class="device-name">{{ d.name }}</span>
                <span class="device-meta">last seen {{ d.last_seen ? formatRelative(d.last_seen) : 'never' }}</span>
                <button class="btn-small btn-danger" (click)="revokeDevice(d.id, d.name)">Revoke</button>
              </div>
            }
          </div>
        }
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

    .cluster-result {
      margin-top: 8px;
      padding: 8px 12px;
      background: #0f2118;
      border: 1px solid #1f4a30;
      border-radius: 6px;
      color: #8c8;
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

    .tv-date-range {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 12px;
      flex-wrap: wrap;

      .toggle-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;

        span { color: #aaa; font-size: 0.85rem; }
      }

      .date-input {
        background: #222;
        border: 1px solid #444;
        color: #e0e0e0;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 0.85rem;

        &:focus { outline: none; border-color: #666; }
        &::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      }
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

    .number-input {
      width: 64px;
      padding: 4px 6px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #ddd;
      border-radius: 4px;
      font-size: 0.85rem;
    }

    .pair-code-box {
      background: #1a2a3a;
      border: 1px solid #2a4a6a;
      border-radius: 6px;
      padding: 12px;
      margin: 12px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pair-code {
      font-family: monospace;
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: 0.4em;
      color: #fff;
    }
    .pair-hint { font-size: 0.75rem; color: #8ac; }

    .devices-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
    .device-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #1e1e1e;
      border: 1px solid #2a2a2a;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .device-name { flex: 1; color: #ddd; }
    .device-meta { font-size: 0.75rem; color: #888; }
    .btn-danger { color: #e88; border-color: #844; &:hover { background: rgba(255,100,100,0.15); } }

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

    .nas-health {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 18px;
      font-size: 0.85rem;
      border: 1px solid;
      flex-wrap: wrap;

      .nas-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .nas-label {
        color: #888;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
      }
      .nas-state {
        font-weight: 500;
      }
      .nas-path {
        color: #666;
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 0.75rem;
        word-break: break-all;
      }
      .nas-hint {
        color: #c88;
        font-size: 0.75rem;
        margin-left: auto;
      }

      &.state-rw {
        background: #0f2118;
        border-color: #1f4a30;
        .nas-dot { background: #4a4; box-shadow: 0 0 6px #4a4; }
        .nas-state { color: #8c8; }
      }
      &.state-ro {
        background: #2a1f0f;
        border-color: #5a4520;
        .nas-dot { background: #d80; box-shadow: 0 0 6px #d80; }
        .nas-state { color: #ec8; }
      }
      &.state-missing {
        background: #2a0f0f;
        border-color: #5a1f1f;
        .nas-dot { background: #d44; box-shadow: 0 0 6px #d44; }
        .nas-state { color: #f88; }
      }
      &.state-unknown {
        background: #1a1a1a;
        border-color: #333;
        .nas-dot { background: #666; }
        .nas-state { color: #888; }
      }
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
  // YYYY-MM strings for the <input type="month"> bindings. Empty = no bound.
  tvFromMonth = '';
  tvToMonth = '';

  faceScanRunning = true; // assume running until status confirms
  faceStatus: { running: boolean; total: number; scanned: number; faces: number; remaining: number } | null = null;
  private facePollTimer: ReturnType<typeof setInterval> | null = null;
  clusteringRunning = false;
  clusteringResult: { newPeople: number; photosCovered: number } | null = null;
  private clusteringResultTimer: ReturnType<typeof setTimeout> | null = null;
  gpsRunning = true; // assume running until status confirms
  gpsStatus: { running: boolean; withGps: number; withoutGps: number; checked: number; found: number; total: number } | null = null;
  private gpsPollTimer: ReturnType<typeof setInterval> | null = null;
  datesRunning = true; // assume running until status confirms
  datesStatus: { running: boolean; checked: number; updated: number; total: number } | null = null;
  private datesPollTimer: ReturnType<typeof setInterval> | null = null;
  embeddingRunning = true; // assume running until status confirms otherwise
  embeddingStatus: { running: boolean; total: number; embedded: number; remaining: number } | null = null;
  thumbsRunning = true; // assume running until status confirms
  thumbsStatus: { running: boolean; checked: number; generated: number; total: number } | null = null;
  private thumbsPollTimer: ReturnType<typeof setInterval> | null = null;
  ingestRunning = false;
  ingestResult: { imported: number; duplicates: number; errors: number } | null = null;

  pairingCode = '';
  devices: Array<{ id: number; name: string; last_seen: string | null }> = [];

  health: { status: string; nas: { state: 'rw' | 'ro' | 'missing' | 'unknown'; mediaRoot: string; checkedAt: string } } | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly settingsService: SettingsService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getStats().subscribe({ next: (s) => { this.stats = s; this.cdr.detectChanges(); } });
    this.api.getScanStatus().subscribe({ next: (s) => { this.scanStatus = s; this.cdr.detectChanges(); } });
    this.api.getCleanupLog().subscribe({ next: (items) => { this.cleanupItems = items; this.cdr.detectChanges(); } });
    this.refreshDevices();
    this.settingsService.settings$.subscribe((s) => {
      this.settings = s;
      // Convert "YYYY-MM-DD" stored in app_settings → "YYYY-MM" for the
      // <input type="month"> binding. Empty string means "no bound".
      this.tvFromMonth = (s['tv_from_date'] ?? '').slice(0, 7);
      this.tvToMonth = (s['tv_to_date'] ?? '').slice(0, 7);
      this.cdr.detectChanges();
    });
    this.refreshEmbeddingStatus();
    this.refreshGpsStatus();
    this.refreshDatesStatus();
    this.refreshThumbsStatus();
    this.refreshFaceStatus();
    this.api.getCronStatus().subscribe({ next: (s) => { this.cronStatus = s; this.cdr.detectChanges(); } });
    this.api.getTvStatus().subscribe({ next: (s) => { this.dlnaRunning = s.dlna.running; this.cdr.detectChanges(); } });
    this.api.getAlbums().subscribe({ next: (albums) => {
      const tv = albums.find((a: { name: string }) => a.name === 'TV Slideshow');
      if (tv) this.tvAlbumId = tv.id;
      this.cdr.detectChanges();
    }});
    this.api.getHealth().subscribe({
      next: (h) => { this.health = h; this.cdr.detectChanges(); },
      error: () => { /* /health unreachable — leave chip hidden */ },
    });
  }

  nasStateLabel(state: 'rw' | 'ro' | 'missing' | 'unknown'): string {
    switch (state) {
      case 'rw': return 'Connected (read/write)';
      case 'ro': return 'Read-only — uploads and trash will fail';
      case 'missing': return 'Not mounted — photos will not load';
      case 'unknown': return 'Checking…';
    }
  }

  toggleSetting(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settingsService.set(key, checked ? 'true' : 'false');
  }

  setRetentionDays(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1 || days > 365) return;
    this.settingsService.set('trash_retention_days', String(days));
  }

  /** Persist tv_from_date as the first day of the chosen month (YYYY-MM-01). */
  onTvFromChange(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.settingsService.set('tv_from_date', v ? `${v}-01` : '');
  }

  /** Persist tv_to_date as the last day of the chosen month. */
  onTvToChange(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (!v) {
      this.settingsService.set('tv_to_date', '');
      return;
    }
    // Compute end-of-month for inclusive upper bound (e.g. "2024-12" → "2024-12-31")
    const [y, m] = v.split('-').map((s) => parseInt(s, 10));
    const lastDay = new Date(y, m, 0).getDate();
    this.settingsService.set('tv_to_date', `${v}-${String(lastDay).padStart(2, '0')}`);
  }

  clearTvDateRange(): void {
    this.settingsService.set('tv_from_date', '');
    this.settingsService.set('tv_to_date', '');
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

  private refreshDatesStatus(): void {
    this.api.getRescanDatesStatus().subscribe({ next: (s) => {
      this.datesStatus = s;
      this.datesRunning = s.running;
      if (s.running && !this.datesPollTimer) {
        this.datesPollTimer = setInterval(() => this.refreshDatesStatus(), 3000);
      }
      if (!s.running && this.datesPollTimer) {
        clearInterval(this.datesPollTimer);
        this.datesPollTimer = null;
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

  rescanDates(): void {
    this.datesRunning = true;
    this.api.rescanDates().subscribe();
    if (!this.datesPollTimer) {
      this.datesPollTimer = setInterval(() => this.refreshDatesStatus(), 3000);
    }
  }

  cancelDatesScan(): void {
    this.api.cancelRescanDates().subscribe({
      next: () => {
        this.datesRunning = false;
        if (this.datesPollTimer) { clearInterval(this.datesPollTimer); this.datesPollTimer = null; }
        this.refreshDatesStatus();
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

  restoreMessage = '';

  restoreBackup(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!confirm('Restore database from backup? This will overwrite the current database. A pre-restore backup will be saved. The server must be restarted after restore.')) {
      input.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/backup/restore', { method: 'POST', body: formData })
      .then((r) => r.json())
      .then((result: { ok?: boolean; message?: string; error?: string }) => {
        this.restoreMessage = result.ok ? (result.message ?? 'Restored') : (result.error ?? 'Failed');
        input.value = '';
        this.cdr.detectChanges();
      })
      .catch(() => {
        this.restoreMessage = 'Upload failed';
        this.cdr.detectChanges();
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
    this.clusteringResult = null;
    if (this.clusteringResultTimer) {
      clearTimeout(this.clusteringResultTimer);
      this.clusteringResultTimer = null;
    }

    // Snapshot people-list before clustering. We include ignored people so a
    // status flip during the request can't make the count drift. The delta in
    // people count = clusters created; the delta in summed photo_count =
    // photos newly attributed to a known person via this run.
    this.api.getPeople(true).subscribe({
      next: (before) => {
        const beforeCount = before.length;
        const beforePhotos = before.reduce((sum, p) => sum + (p.photo_count ?? 0), 0);

        this.api.triggerFaceClustering().subscribe({
          next: () => {
            this.api.getPeople(true).subscribe({
              next: (after) => {
                const afterPhotos = after.reduce((sum, p) => sum + (p.photo_count ?? 0), 0);
                this.clusteringResult = {
                  newPeople: Math.max(0, after.length - beforeCount),
                  photosCovered: Math.max(0, afterPhotos - beforePhotos),
                };
                this.clusteringRunning = false;
                this.cdr.detectChanges();
                this.clusteringResultTimer = setTimeout(() => {
                  this.clusteringResult = null;
                  this.clusteringResultTimer = null;
                  this.cdr.detectChanges();
                }, 15000);
              },
              error: () => { this.clusteringRunning = false; this.cdr.detectChanges(); },
            });
          },
          error: () => { this.clusteringRunning = false; this.cdr.detectChanges(); },
        });
      },
      error: () => { this.clusteringRunning = false; this.cdr.detectChanges(); },
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

  // ── Device pairing ──
  generatePairingCode(): void {
    this.api.generatePairingCode().subscribe({
      next: (res) => {
        this.pairingCode = res.code;
        this.cdr.detectChanges();
        // Clear after 5 minutes (matches expiration)
        setTimeout(() => { this.pairingCode = ''; this.cdr.detectChanges(); }, 5 * 60 * 1000);
      },
    });
  }

  revokeDevice(id: number, name: string): void {
    if (!confirm(`Revoke "${name}"? It will no longer be able to upload.`)) return;
    this.api.revokeDevice(id).subscribe({
      next: () => this.refreshDevices(),
    });
  }

  private refreshDevices(): void {
    this.api.getDevices().subscribe({
      next: (devices) => {
        this.devices = devices.map((d) => ({ id: d.id, name: d.name, last_seen: d.last_seen }));
        this.cdr.detectChanges();
      },
    });
  }

  formatRelative(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return `${days}d ago`;
    const hours = Math.floor(ms / 3600000);
    if (hours >= 1) return `${hours}h ago`;
    const mins = Math.floor(ms / 60000);
    if (mins >= 1) return `${mins}m ago`;
    return 'just now';
  }
}
