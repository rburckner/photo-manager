import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import type { CollectionStats } from '../../models/photo.model';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stats-container">
      <h2>Collection Statistics</h2>

      @if (stats) {
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ stats.total.toLocaleString() }}</div>
            <div class="stat-label">Total Items</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ (stats.images ?? 0).toLocaleString() }}</div>
            <div class="stat-label">Photos</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ (stats.videos ?? 0).toLocaleString() }}</div>
            <div class="stat-label">Videos</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ formatBytes(stats.totalSize ?? 0) }}</div>
            <div class="stat-label">Total Size</div>
          </div>
          @if (stats.earliestDate) {
            <div class="stat-card wide">
              <div class="stat-value">{{ stats.earliestDate.slice(0, 10) }} &mdash; {{ stats.latestDate?.slice(0, 10) ?? 'now' }}</div>
              <div class="stat-label">Date Range</div>
            </div>
          }
        </div>
      }

      <!-- Scan status -->
      @if (scanStatus && scanStatus.status === 'running') {
        <div class="scan-banner">
          Scan in progress: {{ scanStatus.processed_files?.toLocaleString() }} / {{ scanStatus.total_files?.toLocaleString() }} files
          <div class="scan-bar">
            <div class="scan-progress" [style.width.%]="scanPercent"></div>
          </div>
        </div>
      }

      <!-- Photos by year -->
      @if (yearStats.length > 0) {
        <div class="chart-section">
          <h3>Photos by Year</h3>
          <div class="bar-chart">
            @for (item of yearStats; track item.year) {
              <div class="bar-row">
                <span class="bar-label">{{ item.year }}</span>
                <div class="bar-track">
                  <div class="bar-fill" [style.width.%]="(item.count / maxYearCount) * 100"></div>
                </div>
                <span class="bar-value">{{ item.count.toLocaleString() }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Cameras -->
      @if (cameraStats.length > 0) {
        <div class="chart-section">
          <h3>Top Cameras</h3>
          <div class="bar-chart">
            @for (item of cameraStats; track item.camera) {
              <div class="bar-row">
                <span class="bar-label camera-label">{{ item.camera }}</span>
                <div class="bar-track">
                  <div class="bar-fill camera-fill" [style.width.%]="(item.count / maxCameraCount) * 100"></div>
                </div>
                <span class="bar-value">{{ item.count.toLocaleString() }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- File types -->
      @if (typeStats.length > 0) {
        <div class="chart-section">
          <h3>File Types</h3>
          <div class="type-grid">
            @for (item of typeStats; track item.mime_type) {
              <div class="type-card">
                <div class="type-name">{{ item.mime_type.split('/')[1] ?? item.mime_type }}</div>
                <div class="type-count">{{ item.count.toLocaleString() }} files</div>
                <div class="type-size">{{ formatBytes(item.total_size) }}</div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .stats-container {
      height: 100vh;
      overflow-y: auto;
      padding: 24px;

      h2 { margin: 0 0 20px; color: #ddd; font-size: 1.2rem; }
      h3 { margin: 24px 0 12px; color: #ccc; font-size: 1rem; }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: #222;
      border-radius: 8px;
      padding: 16px;

      &.wide { grid-column: span 2; }
    }

    .stat-value {
      font-size: 1.6rem;
      font-weight: 600;
      color: #fff;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #888;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* ── Scan banner ── */
    .scan-banner {
      background: #1a2a1a;
      border: 1px solid #2a4a2a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      color: #8c8;
      font-size: 0.85rem;
    }

    .scan-bar {
      height: 4px;
      background: #333;
      border-radius: 2px;
      margin-top: 8px;
    }

    .scan-progress {
      height: 100%;
      background: #4a4;
      border-radius: 2px;
      transition: width 0.5s;
    }

    /* ── Bar chart ── */
    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bar-label {
      width: 50px;
      font-size: 0.8rem;
      color: #aaa;
      text-align: right;
      flex-shrink: 0;

      &.camera-label {
        width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .bar-track {
      flex: 1;
      height: 18px;
      background: #1a1a1a;
      border-radius: 3px;
    }

    .bar-fill {
      height: 100%;
      background: #3a6acf;
      border-radius: 3px;
      min-width: 2px;
      transition: width 0.3s;

      &.camera-fill { background: #6a4acf; }
    }

    .bar-value {
      width: 60px;
      font-size: 0.75rem;
      color: #888;
      flex-shrink: 0;
    }

    /* ── Type grid ── */
    .type-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }

    .type-card {
      background: #222;
      border-radius: 6px;
      padding: 10px;
    }

    .type-name {
      font-size: 0.85rem;
      color: #ddd;
      font-weight: 500;
    }

    .type-count {
      font-size: 0.75rem;
      color: #888;
      margin-top: 2px;
    }

    .type-size {
      font-size: 0.7rem;
      color: #666;
    }
  `],
})
export class StatsComponent implements OnInit {
  stats: CollectionStats | null = null;
  yearStats: Array<{ year: string; count: number }> = [];
  cameraStats: Array<{ camera: string; count: number }> = [];
  typeStats: Array<{ mime_type: string; count: number; total_size: number }> = [];
  scanStatus: { status: string; processed_files?: number; total_files?: number } | null = null;

  maxYearCount = 1;
  maxCameraCount = 1;
  scanPercent = 0;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getStats().subscribe({ next: (s) => { this.stats = s; this.cdr.detectChanges(); } });
    this.api.getStatsByYear().subscribe({
      next: (data) => {
        this.yearStats = data;
        this.maxYearCount = Math.max(...data.map((d) => d.count), 1);
        this.cdr.detectChanges();
      },
    });
    this.api.getStatsByCamera().subscribe({
      next: (data) => {
        this.cameraStats = data;
        this.maxCameraCount = Math.max(...data.map((d) => d.count), 1);
        this.cdr.detectChanges();
      },
    });
    this.api.getStatsByType().subscribe({ next: (data) => { this.typeStats = data; this.cdr.detectChanges(); } });
    this.api.getScanStatus().subscribe({
      next: (s) => {
        this.scanStatus = s;
        if (s.total_files && s.processed_files) {
          this.scanPercent = Math.round((s.processed_files / s.total_files) * 100);
        }
        this.cdr.detectChanges();
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(1)} ${units[i]}`;
  }
}
