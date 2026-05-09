import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { ThumbSizeSliderComponent } from '../thumb-size-slider/thumb-size-slider';
import { LightboxComponent } from '../lightbox/lightbox';
import type { Photo, PersonSummary } from '../../models/photo.model';

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent, ThumbSizeSliderComponent],
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
          <app-thumb-size-slider />
        </div>
      </div>

      <div class="face-slider" #faceSlider>
        @for (person of people; track person.id) {
          <div
            class="face-circle"
            [class.selected]="selectedPersonSummary?.id === person.id"
            [class.unreviewed]="person.status === 'unreviewed'"
            [class.hidden]="person.status === 'hidden'"
            [class.ignored]="person.status === 'ignored'"
            [title]="person.status === 'hidden' ? 'Hidden — photos with this face are filtered everywhere except here' : (person.status === 'ignored' ? 'Ignored — appears here only when Show ignored is on' : '')"
            (click)="selectPersonSummary(person)"
          >
            @if (person.representative_face_id) {
              <img
                [src]="getFaceCropUrl(person.representative_face_id)"
                [alt]="person.name ?? 'Unknown'"
                (error)="onImageError($event)"
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
            <div class="merge-section">
              <button class="btn-status" (click)="showMergeDropdown = !showMergeDropdown">Merge with...</button>
              @if (showMergeDropdown) {
                <div class="merge-dropdown">
                  @for (person of getMergeTargets(); track person.id) {
                    <div class="merge-option" (click)="mergePerson(person)">
                      {{ person.name ?? 'Unknown' }} ({{ person.photo_count }})
                    </div>
                  }
                  @if (getMergeTargets().length === 0) {
                    <div class="merge-option disabled">No other people to merge</div>
                  }
                </div>
              }
            </div>
          </div>

          <div class="person-photos" (scroll)="onScroll($event)">
            <div class="photo-grid">
              @for (photo of personPhotos; track photo.id) {
                <div
                  class="photo-card"
                  [class.selectable]="selection.isSelectingSignal()"
                  [class.selected]="selection.selectedIdsSignal().has(photo.id)"
                  (click)="onPhotoClick(photo, $event)"
                  (mouseenter)="photo.is_video === 1 ? onVideoHover($event, photo, true) : null"
                  (mouseleave)="photo.is_video === 1 ? onVideoHover($event, photo, false) : null"
                >
                  @if (selection.isSelectingSignal()) {
                    <div class="select-check">&#10003;</div>
                  }
                  <img
                    [src]="api.getThumbnailUrl(photo.id)"
                    [alt]="photo.file_name"
                    loading="lazy"
                    (error)="onImageError($event)"
                  />
                </div>
              }
              @if (loadingPhotos) {
                <div class="grid-loading">Loading...</div>
              }
            </div>
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

      /* Hidden — dim + diagonal slash so they read distinctly at a glance */
      &.hidden {
        img, .no-face {
          opacity: 0.5;
          filter: grayscale(0.6);
        }
        .face-name { color: #844; }

        /* Diagonal slash drawn with a gradient band on a circle-clipped
           pseudo-element. Sized to match the 112px image. The gradient axis
           runs top-left → bottom-right, so the perpendicular band reads as
           a "/" shape (classic strikethrough). */
        position: relative;
        &::after {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 112px;
          height: 112px;
          border-radius: 50%;
          transform: translateX(-50%);
          pointer-events: none;
          background: linear-gradient(
            135deg,
            transparent calc(50% - 2px),
            #e88 calc(50% - 2px),
            #e88 calc(50% + 2px),
            transparent calc(50% + 2px)
          );
        }
      }

      /* Ignored — just a softer grayscale, no slash (these are random people
         we've decided aren't worth tracking, not deliberately blocked) */
      &.ignored {
        img, .no-face {
          opacity: 0.45;
          filter: grayscale(0.85);
        }
        .face-name { color: #666; font-style: italic; }
      }
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
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .person-controls {
      flex-shrink: 0;
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

    /* Mirror timeline's pattern: scroll container is a plain block, the
       grid is a regular block child. Keeps the grid out of the flex layout
       so aspect-ratio: 1 on items works reliably. */
    .person-photos {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--thumb-size, 160px), 1fr));
      gap: 4px;
    }

    .photo-card {
      position: relative;
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

    .merge-section {
      position: relative;
      margin-left: 8px;
    }

    .merge-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 100;
      min-width: 200px;
      margin-top: 4px;
    }

    .merge-option {
      padding: 8px 14px;
      font-size: 0.85rem;
      color: #ccc;
      cursor: pointer;

      &:hover { background: #333; }
      &.disabled { color: #666; cursor: default; &:hover { background: transparent; } }
    }
  `],
})
export class PeopleComponent implements OnInit, OnDestroy, AfterViewInit {
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
  showMergeDropdown = false;

  @ViewChild('faceSlider') faceSliderRef?: ElementRef<HTMLElement>;
  private faceSliderWheelCleanup?: () => void;

  private subs: Subscription[] = [];

  constructor(
    public readonly api: ApiService,
    public readonly selection: SelectionService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadPeople();
    // Reload after a bulk action (reassign / hide / delete) fires from the
    // selection bar so the person photo grid reflects the new state.
    this.subs.push(
      this.selection.refresh$.subscribe(() => {
        this.loadPeople();
        if (this.selectedPersonSummary) {
          this.personPhotos = [];
          this.photoPage = 1;
          this.hasMorePhotos = true;
          this.loadPersonSummaryPhotos();
        }
      }),
    );
  }

  ngAfterViewInit(): void {
    const el = this.faceSliderRef?.nativeElement;
    if (!el) return;
    // Native listener (passive: false) so preventDefault works — Angular
    // template (wheel) bindings are passive in newer versions.
    const handler = (event: WheelEvent): void => {
      if (event.deltaY === 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if ((event.deltaY > 0 && atEnd) || (event.deltaY < 0 && atStart)) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    this.faceSliderWheelCleanup = (): void => { el.removeEventListener('wheel', handler); };
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.faceSliderWheelCleanup?.();
    this.selection.exitSelectionMode();
    this.selection.setCurrentPersonId(null);
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
    this.selection.exitSelectionMode();
    this.selection.setCurrentPersonId(person.id);
    this.loadPersonSummaryPhotos();
  }

  onPhotoClick(photo: Photo, event: MouseEvent): void {
    // Ctrl/Cmd-click → toggle selection (enter selection mode if needed)
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(photo.id);
      this.lastClickedPhotoId = photo.id;
      return;
    }
    // Shift-click → range select within the current grid
    if (event.shiftKey && this.lastClickedPhotoId !== null && this.selection.isSelecting) {
      const startIdx = this.personPhotos.findIndex((p) => p.id === this.lastClickedPhotoId);
      const endIdx = this.personPhotos.findIndex((p) => p.id === photo.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        this.selection.selectAll(this.personPhotos.slice(from, to + 1).map((p) => p.id));
      }
      return;
    }
    // Plain click in selection mode → toggle; else open lightbox
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      this.lastClickedPhotoId = photo.id;
      return;
    }
    this.openPhoto(photo);
  }

  private lastClickedPhotoId: number | null = null;

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

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.src.endsWith('/ladybug.svg')) return;
    img.src = '/ladybug.svg';
  }

  getMergeTargets(): PersonSummary[] {
    if (!this.selectedPersonSummary) return [];
    return this.people.filter((p) => p.id !== this.selectedPersonSummary!.id);
  }

  mergePerson(target: PersonSummary): void {
    if (!this.selectedPersonSummary) return;
    if (!confirm(`Merge "${this.selectedPersonSummary.name ?? 'Unknown'}" into "${target.name ?? 'Unknown'}"? This cannot be undone.`)) return;

    this.api.mergePeople(target.id, this.selectedPersonSummary.id).subscribe({
      next: () => {
        this.showMergeDropdown = false;
        this.selectedPersonSummary = null;
        this.personPhotos = [];
        this.loadPeople();
      },
    });
  }

  onVideoHover(event: Event, photo: { id: number }, enter: boolean): void {
    const card = (event.target as HTMLElement).closest('.photo-card') as HTMLElement;
    if (!card) return;

    if (enter) {
      const video = document.createElement('video');
      video.src = `/api/photos/${photo.id}/video-preview`;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.className = 'video-preview';
      video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2';
      card.appendChild(video);
    } else {
      const video = card.querySelector('.video-preview');
      if (video) {
        (video as HTMLVideoElement).pause();
        video.remove();
      }
    }
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
