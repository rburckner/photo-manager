import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import type { Photo } from '../../models/photo.model';

interface YearMonth {
  label: string;
  date: string; // ISO date for the 15th of that month
  dragOver: boolean;
}

@Component({
  selector: 'app-fix-dates',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fix-dates-container">
      <div class="fix-header">
        <h2>Fix Dates</h2>
        <span class="count">{{ photos.length }} photos with bad or missing dates</span>
      </div>

      <div class="fix-layout">
        <!-- Left: photos with bad dates -->
        <div class="bad-photos">
          <div class="section-label">Drag photos to a month on the right</div>
          <div class="photo-grid">
            @for (photo of photos; track photo.id) {
              <div
                class="photo-card"
                [class.selected]="selectedIds.has(photo.id)"
                draggable="true"
                (dragstart)="onDragStart($event, photo)"
                (click)="toggleSelect(photo.id)"
              >
                <img
                  [src]="api.getThumbnailUrl(photo.id)"
                  loading="lazy"
                  (error)="onImageError($event)"
                />
                <div class="photo-date">
                  {{ photo.date_taken ? photo.date_taken.slice(0, 10) : 'No date' }}
                </div>
                @if (selectedIds.has(photo.id)) {
                  <div class="select-check">&#10003;</div>
                }
              </div>
            }
            @if (photos.length === 0 && !loading) {
              <div class="empty">All photos have valid dates</div>
            }
          </div>
        </div>

        <!-- Right: month/year drop targets -->
        <div class="date-targets">
          <div class="section-label">Drop target months</div>
          <div class="year-nav">
            <button (click)="changeYear(-1)">&laquo;</button>
            <span class="year-label">{{ targetYear }}</span>
            <button (click)="changeYear(1)">&raquo;</button>
          </div>
          <div class="month-grid">
            @for (month of months; track month.label) {
              <div
                class="month-cell"
                [class.drag-over]="month.dragOver"
                (dragover)="onDragOver($event, month)"
                (dragleave)="month.dragOver = false"
                (drop)="onDrop($event, month)"
              >
                {{ month.label }}
              </div>
            }
          </div>
        </div>
      </div>

      @if (actionMessage) {
        <div class="action-toast">{{ actionMessage }}</div>
      }
    </div>
  `,
  styles: [`
    .fix-dates-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .fix-header {
      padding: 14px 20px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: baseline;
      gap: 12px;
      flex-shrink: 0;

      h2 { margin: 0; font-size: 1.1rem; color: #ddd; }
      .count { font-size: 0.8rem; color: #888; }
    }

    .fix-layout {
      flex: 1;
      display: flex;
      overflow: hidden;
      min-height: 0; /* flex child needs this to shrink */
    }

    .bad-photos {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid #333;
      min-height: 0;
    }

    .section-label {
      padding: 8px 16px;
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #2a2a2a;
    }

    .photo-grid {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      grid-auto-rows: 120px;
      gap: 4px;
      align-content: start;
      min-height: 0;
    }

    .photo-card {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 4px;
      cursor: grab;
      background: #222;

      &:active { cursor: grabbing; }
      &.selected { outline: 2px solid #3a7bd5; outline-offset: -2px; }

      img { width: 100%; height: 100%; object-fit: cover; }
    }

    .photo-date {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.7);
      color: #aaa;
      font-size: 0.65rem;
      padding: 2px 4px;
      text-align: center;
    }

    .select-check {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #3a7bd5;
      color: #fff;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px;
      color: #555;
    }

    /* ── Date targets ── */
    .date-targets {
      width: 280px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
    }

    .year-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 12px;

      button {
        background: #2a2a2a;
        border: 1px solid #444;
        color: #ddd;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        &:hover { background: #333; }
      }

      .year-label {
        font-size: 1.1rem;
        color: #ddd;
        font-weight: 500;
      }
    }

    .month-grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      padding: 8px;
    }

    .month-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #222;
      border: 2px dashed #333;
      border-radius: 8px;
      color: #aaa;
      font-size: 0.85rem;
      cursor: default;
      transition: all 0.15s;
      min-height: 50px;

      &.drag-over {
        background: #1a3a1a;
        border-color: #4a4;
        color: #8c8;
      }
    }

    .action-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a3a1a;
      border: 1px solid #2a5a2a;
      color: #8c8;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 0.85rem;
      z-index: 3000;
    }
  `],
})
export class FixDatesComponent implements OnInit {
  photos: Photo[] = [];
  loading = true;
  selectedIds = new Set<number>();
  targetYear = new Date().getFullYear();
  months: YearMonth[] = [];
  actionMessage = '';

  private draggedIds: number[] = [];

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.buildMonths();
  }

  ngOnInit(): void {
    this.loadBadPhotos();
  }

  loadBadPhotos(): void {
    this.api.getBadDatePhotos().subscribe({
      next: (photos) => {
        this.photos = photos;
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  buildMonths(): void {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    this.months = names.map((name, i) => ({
      label: name,
      date: `${this.targetYear}-${String(i + 1).padStart(2, '0')}-15T12:00:00.000Z`,
      dragOver: false,
    }));
  }

  changeYear(delta: number): void {
    this.targetYear += delta;
    this.buildMonths();
  }

  toggleSelect(id: number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  onDragStart(event: DragEvent, photo: Photo): void {
    // Drag selected photos, or just the one being dragged
    if (this.selectedIds.has(photo.id)) {
      this.draggedIds = [...this.selectedIds];
    } else {
      this.draggedIds = [photo.id];
    }
    event.dataTransfer?.setData('text/plain', this.draggedIds.join(','));
  }

  onDragOver(event: DragEvent, month: YearMonth): void {
    event.preventDefault();
    month.dragOver = true;
  }

  onDrop(event: DragEvent, month: YearMonth): void {
    event.preventDefault();
    month.dragOver = false;

    const ids = this.draggedIds.length > 0 ? this.draggedIds : [];
    if (ids.length === 0) return;

    this.api.bulkSetDate(ids, month.date).subscribe({
      next: () => {
        // Remove fixed photos from the list
        this.photos = this.photos.filter((p) => !ids.includes(p.id));
        this.selectedIds.clear();
        this.draggedIds = [];
        this.actionMessage = `Set ${ids.length} photos to ${month.label} ${this.targetYear}`;
        this.cdr.detectChanges();
        setTimeout(() => { this.actionMessage = ''; this.cdr.detectChanges(); }, 2000);
      },
    });
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
