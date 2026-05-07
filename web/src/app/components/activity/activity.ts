import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

interface ActivityEntry {
  id: number;
  action: string;
  details: string;
  timestamp: string;
}

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="activity-container">
      <h2>Activity Log</h2>

      @if (loading) {
        <div class="loading">Loading activity...</div>
      }

      @if (!loading && entries.length === 0) {
        <div class="empty">No activity recorded yet.</div>
      }

      @if (entries.length > 0) {
        <div class="activity-list">
          <div class="activity-header-row">
            <span class="col-action">Action</span>
            <span class="col-details">Details</span>
            <span class="col-time">Time</span>
          </div>
          @for (entry of entries; track entry.id) {
            <div class="activity-row">
              <span class="col-action">{{ entry.action }}</span>
              <span class="col-details">{{ entry.details }}</span>
              <span class="col-time">{{ formatTime(entry.timestamp) }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .activity-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 20px;
      overflow-y: auto;

      h2 { margin: 0 0 16px; color: #ddd; font-size: 1.2rem; }
    }

    .loading, .empty {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .activity-list {
      flex: 1;
    }

    .activity-header-row {
      display: flex;
      gap: 16px;
      padding: 8px 12px;
      border-bottom: 1px solid #444;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
    }

    .activity-row {
      display: flex;
      gap: 16px;
      padding: 10px 12px;
      border-bottom: 1px solid #2a2a2a;
      font-size: 0.85rem;
      color: #ccc;

      &:hover { background: #222; }
    }

    .col-action { width: 160px; flex-shrink: 0; font-weight: 500; }
    .col-details { flex: 1; color: #aaa; }
    .col-time { width: 180px; flex-shrink: 0; color: #666; text-align: right; }
  `],
})
export class ActivityComponent implements OnInit {
  entries: ActivityEntry[] = [];
  loading = true;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.api.getActivityLog().subscribe({
      next: (entries) => {
        this.entries = entries;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
