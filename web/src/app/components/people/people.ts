import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { Photo, PersonSummary } from '../../models/photo.model';

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent],
  template: `
    <div class="people-container">
      <!-- Top: face circles slider -->
      <div class="people-header">
        <h2>People</h2>
        <div class="header-actions">
          <label class="show-ignored">
            <input type="checkbox" [(ngModel)]="showIgnored" (change)="loadPeople()" />
            Show ignored
          </label>
          @if (unreviewedCount > 0) {
            <span class="unreviewed-badge">{{ unreviewedCount }} to review</span>
          }
        </div>
      </div>

      <div class="face-slider">
        @for (person of people; track person.id) {
          <div
            class="face-circle"
            [class.selected]="selectedPersonSummary?.id === person.id"
            [class.unreviewed]="person.status === 'unreviewed'"
            (click)="selectPersonSummary(person)"
          >
            @if (person.representative_face_id) {
              <img
                [src]="getFaceCropUrl(person.representative_face_id)"
                [alt]="person.name ?? 'Unknown'"
              />
            } @else {
              <div class="no-face">?</div>
            }
            <div class="face-name">{{ person.name ?? 'Unknown' }}</div>
            <div class="face-count">{{ person.photo_count }}</div>
          </div>
        }
        @if (people.length === 0 && !loading) {
          <div class="no-people">
            No faces detected yet. Run face scan from the settings or API.
          </div>
        }
      </div>

      <!-- Selected person: triage controls + photo grid -->
      @if (selectedPersonSummary) {
        <div class="person-detail">
          <div class="person-controls">
            <input
              type="text"
              [value]="selectedPersonSummary.name ?? ''"
              placeholder="Name this person..."
              class="name-input"
              (keydown.enter)="namePersonSummary($event)"
              (blur)="namePersonSummary($event)"
            />
            <div class="status-buttons">
              <button
                class="btn-status"
                [class.active]="selectedPersonSummary.status === 'named'"
                (click)="setStatus(selectedPersonSummary.status === 'named' ? 'unreviewed' : 'named')"
              >Named</button>
              <button
                class="btn-status btn-ignore"
                [class.active]="selectedPersonSummary.status === 'ignored'"
                (click)="setStatus(selectedPersonSummary.status === 'ignored' ? 'unreviewed' : 'ignored')"
              >Ignore</button>
              <button
                class="btn-status btn-hide"
                [class.active]="selectedPersonSummary.status === 'hidden'"
                (click)="setStatus(selectedPersonSummary.status === 'hidden' ? 'unreviewed' : 'hidden')"
              >Hide</button>
            </div>
          </div>

          <div class="person-photos" (scroll)="onScroll($event)">
            @for (photo of personPhotos; track photo.id) {
              <div class="photo-card" (click)="openPhoto(photo)">
                <img
                  [src]="api.getThumbnailUrl(photo.id)"
                  [alt]="photo.file_name"
                  loading="lazy"
                />
              </div>
            }
            @if (loadingPhotos) {
              <div class="grid-loading">Loading...</div>
            }
          </div>
        </div>
      }
    </div>

    @if (selectedPhoto) {
      <app-lightbox
        [photo]="selectedPhoto"
        (close)="closeLightbox()"
        (prev)="navigatePhoto(-1)"
        (next)="navigatePhoto(1)"
      />
    }
  `,
  styles: [`
    .people-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .people-header {
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #333;
      flex-shrink: 0;

      h2 { margin: 0; font-size: 1.1rem; color: #ddd; }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
    }

    .show-ignored {
      font-size: 0.8rem;
      color: #888;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;

      input { cursor: pointer; }
    }

    .unreviewed-badge {
      background: #3a3a1a;
      border: 1px solid #5a5a2a;
      color: #cc8;
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 0.75rem;
    }

    /* ── Face slider ── */
    .face-slider {
      display: flex;
      gap: 16px;
      padding: 20px 24px;
      overflow-x: auto;
      flex-shrink: 0;
      border-bottom: 1px solid #333;
    }

    .face-circle {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      flex-shrink: 0;
      width: 128px;

      img {
        width: 112px;
        height: 112px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid transparent;
        transition: border-color 0.15s;
      }

      .no-face {
        width: 112px;
        height: 112px;
        border-radius: 50%;
        background: #333;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-size: 1.2rem;
      }

      &:hover img { border-color: #555; }
      &.selected img { border-color: #3a7bd5; }
      &.unreviewed img { border-color: #cc8; }
    }

    .face-name {
      font-size: 0.8rem;
      color: #aaa;
      margin-top: 4px;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
    }

    .face-count {
      font-size: 0.7rem;
      color: #666;
    }

    .no-people {
      padding: 20px;
      color: #666;
      font-size: 0.9rem;
    }

    /* ── PersonSummary detail ── */
    .person-detail {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .person-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid #2a2a2a;
    }

    .name-input {
      background: #222;
      border: 1px solid #444;
      color: #e0e0e0;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.9rem;
      width: 200px;

      &:focus { outline: none; border-color: #666; }
    }

    .status-buttons {
      display: flex;
      gap: 4px;
    }

    .btn-status {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #aaa;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;

      &:hover { background: #333; }
      &.active { background: #333; color: #fff; border-color: #666; }
    }

    .btn-ignore.active { color: #888; }
    .btn-hide.active { color: #e88; border-color: #844; }

    .person-photos {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 4px;
      align-content: start;
    }

    .photo-card {
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 4px;
      cursor: pointer;
      background: #222;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s;
      }

      &:hover img { transform: scale(1.05); }
    }

    .grid-loading {
      grid-column: 1 / -1;
      text-align: center;
      padding: 20px;
      color: #666;
    }
  `],
})
export class PeopleComponent implements OnInit {
  people: PersonSummary[] = [];
  loading = true;
  showIgnored = false;
  unreviewedCount = 0;

  selectedPersonSummary: PersonSummary | null = null;
  personPhotos: Photo[] = [];
  loadingPhotos = false;
  photoPage = 1;
  hasMorePhotos = true;

  selectedPhoto: Photo | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadPeople();
  }

  loadPeople(): void {
    this.loading = true;
    this.api.getPeople(this.showIgnored).subscribe({
      next: (people) => {
        this.people = people;
        this.unreviewedCount = people.filter((p) => p.status === 'unreviewed').length;
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  selectPersonSummary(person: PersonSummary): void {
    this.selectedPersonSummary = person;
    this.personPhotos = [];
    this.photoPage = 1;
    this.hasMorePhotos = true;
    this.loadPersonSummaryPhotos();
  }

  loadPersonSummaryPhotos(): void {
    if (this.loadingPhotos || !this.hasMorePhotos || !this.selectedPersonSummary) return;
    this.loadingPhotos = true;

    this.api.getPersonPhotos(this.selectedPersonSummary.id, this.photoPage).subscribe({
      next: (response) => {
        this.personPhotos.push(...response.photos);
        this.hasMorePhotos = this.photoPage < response.pagination.totalPages;
        this.photoPage++;
        this.loadingPhotos = false;
        this.cdr.detectChanges();
      },
    });
  }

  namePersonSummary(event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (!this.selectedPersonSummary || !name) return;

    this.api.updatePerson(this.selectedPersonSummary.id, { name, status: 'named' }).subscribe({
      next: () => {
        if (this.selectedPersonSummary) {
          this.selectedPersonSummary.name = name;
          this.selectedPersonSummary.status = 'named';
        }
        this.loadPeople();
      },
    });
  }

  setStatus(status: string): void {
    if (!this.selectedPersonSummary) return;
    this.api.updatePerson(this.selectedPersonSummary.id, { status }).subscribe({
      next: () => {
        if (this.selectedPersonSummary) {
          this.selectedPersonSummary.status = status;
        }
        this.loadPeople();
      },
    });
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) {
      this.loadPersonSummaryPhotos();
    }
  }

  getFaceCropUrl(faceId: number): string {
    return `/api/faces/${faceId}/crop`;
  }

  openPhoto(photo: Photo): void { this.selectedPhoto = photo; }
  closeLightbox(): void { this.selectedPhoto = null; }

  navigatePhoto(direction: number): void {
    if (!this.selectedPhoto) return;
    const idx = this.personPhotos.findIndex((p) => p.id === this.selectedPhoto!.id) + direction;
    if (idx >= 0 && idx < this.personPhotos.length) {
      this.selectedPhoto = this.personPhotos[idx]!;
    }
  }
}
