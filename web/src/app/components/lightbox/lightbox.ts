import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { ToastService } from '../../services/toast.service';
import type { Photo, Album, PersonSummary } from '../../models/photo.model';

@Component({
  selector: 'app-lightbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="lightbox-overlay" (click)="close.emit()">
      <div class="lightbox-container" (click)="$event.stopPropagation()">

        <!-- Media -->
        <div class="media-panel">
          @if (photo.is_video === 1) {
            <video
              [src]="api.getFileUrl(photo.id)"
              controls
              autoplay
              class="media"
            ></video>
          } @else {
            <img
              [src]="api.getFileUrl(photo.id)"
              [alt]="photo.file_name"
              class="media"
            />
          }
        </div>

        <!-- Info panel (toggle) -->
        @if (showInfo && fullPhoto) {
          <div class="info-panel">
            <h3>Details</h3>

            <div class="info-section">
              <div class="info-label">Date</div>
              <div class="info-value">
                {{ fullPhoto.date_taken ? (fullPhoto.date_taken | date:'EEEE, MMMM d, y, h:mm a') : 'Unknown' }}
              </div>
            </div>

            @if (fullPhoto.camera_make || fullPhoto.camera_model) {
              <div class="info-section">
                <div class="info-label">Camera</div>
                <div class="info-value">
                  {{ formatCamera(fullPhoto.camera_make, fullPhoto.camera_model) }}
                </div>
              </div>
            }

            @if (fullPhoto.lens) {
              <div class="info-section">
                <div class="info-label">Lens</div>
                <div class="info-value">{{ fullPhoto.lens }}</div>
              </div>
            }

            @if (fullPhoto.width && fullPhoto.height) {
              <div class="info-section">
                <div class="info-label">Resolution</div>
                <div class="info-value">{{ fullPhoto.width }} &times; {{ fullPhoto.height }}</div>
              </div>
            }

            @if (fullPhoto.duration) {
              <div class="info-section">
                <div class="info-label">Duration</div>
                <div class="info-value">{{ formatDuration(fullPhoto.duration) }}</div>
              </div>
            }

            <div class="info-section">
              <div class="info-label">Size</div>
              <div class="info-value">{{ formatBytes(fullPhoto.file_size) }}</div>
            </div>

            <div class="info-section">
              <div class="info-label">Type</div>
              <div class="info-value">{{ fullPhoto.mime_type }}</div>
            </div>

            <div class="info-section">
              <div class="info-label">Path</div>
              <div class="info-value path">{{ fullPhoto.folder_path }}</div>
            </div>

            @if (fullPhoto.gps_lat != null && fullPhoto.gps_lng != null) {
              <div class="info-section">
                <div class="info-label">Location</div>
                <div class="info-value">
                  <a
                    [href]="'https://www.openstreetmap.org/?mlat=' + fullPhoto.gps_lat + '&mlon=' + fullPhoto.gps_lng + '#map=15/' + fullPhoto.gps_lat + '/' + fullPhoto.gps_lng"
                    target="_blank"
                    rel="noopener"
                    class="map-link"
                  >
                    {{ fullPhoto.gps_lat!.toFixed(4) }}, {{ fullPhoto.gps_lng!.toFixed(4) }}
                  </a>
                </div>
              </div>
            }

            <!-- Tags -->
            <div class="info-section">
              <div class="info-label">Tags</div>
              <div class="tag-chips">
                @for (tag of photoTags; track tag.id) {
                  <span class="tag-chip">
                    {{ tag.name }}
                    <button class="tag-remove" (click)="removeTag(tag.id)">&times;</button>
                  </span>
                }
                <input
                  type="text"
                  class="tag-input"
                  placeholder="Add tag..."
                  (keydown.enter)="addTag($event)"
                />
              </div>
            </div>
          </div>
        }

        <!-- Controls -->
        <button class="btn-close" (click)="close.emit()">&times;</button>
        <button class="btn-fav" [class.active]="isFavorite" (click)="toggleFavorite()">
          {{ isFavorite ? '&#9733;' : '&#9734;' }}
        </button>
        <button class="btn-info" [class.active]="showInfo" (click)="toggleInfo()">
          &#9432;
        </button>
        <button class="btn-album" [class.active]="showAlbumPicker" (click)="toggleAlbumPicker()">
          &#43;
        </button>
        <button class="btn-rotate" (click)="rotatePhoto()">
          &#8635;
        </button>
        <button class="btn-similar" (click)="findSimilar()">
          &#128269;
        </button>
        <a class="btn-download" [href]="api.getFileUrl(photo.id)" download>
          &#8615;
        </a>
        @if (activePersonId) {
          <button
            class="btn-reassign"
            [class.active]="showReassignPicker"
            (click)="toggleReassignPicker()"
            title="Reassign this person's face in this photo"
          >&#8644;</button>
        }
        <button class="btn-delete" (click)="deletePhoto()" title="Move to trash">
          &#128465;
        </button>
        <button class="btn-prev" (click)="prev.emit()">&lsaquo;</button>
        <button class="btn-next" (click)="next.emit()">&rsaquo;</button>

        <!-- Album picker -->
        @if (showAlbumPicker) {
          <div class="album-picker">
            <div class="picker-header">Add to Album</div>
            @if (albums.length === 0) {
              <div class="picker-empty">No albums yet</div>
            }
            @for (album of albums; track album.id) {
              <button
                class="picker-item"
                [class.added]="addedAlbumIds.has(album.id)"
                (click)="addToAlbum(album)"
              >
                <span class="picker-name">{{ album.name }}</span>
                @if (addedAlbumIds.has(album.id)) {
                  <span class="picker-check">&#10003;</span>
                }
              </button>
            }
          </div>
        }

        <!-- Reassign-face picker (only when in person context) -->
        @if (showReassignPicker && activePersonId) {
          <div class="album-picker reassign-picker">
            <div class="picker-header">Reassign face in this photo</div>
            <div class="picker-section">Existing people</div>
            @for (p of getReassignTargets(); track p.id) {
              <button class="picker-item" (click)="reassignToExisting(p.id, p.name)">
                <span class="picker-name">{{ p.name ?? 'Unknown' }} ({{ p.photo_count }})</span>
              </button>
            }
            @if (getReassignTargets().length === 0) {
              <div class="picker-empty">No other people</div>
            }
            <div class="picker-section">New person</div>
            <div class="reassign-new-row">
              <input
                type="text"
                class="reassign-new-input"
                placeholder="Name (optional)"
                [(ngModel)]="newReassignName"
                (keydown.enter)="splitToNewPerson()"
              />
              <button class="reassign-new-btn" (click)="splitToNewPerson()">Create &amp; move</button>
            </div>
          </div>
        }

        <!-- Similar photos panel -->
        @if (showSimilar && similarPhotos.length > 0) {
          <div class="similar-panel">
            <div class="similar-header">
              <span>{{ similarPhotos.length }} similar photos (same day{{ hasSamePerson ? ' + same person' : '' }})</span>
              <button class="similar-select-all" (click)="selectAllSimilar()">Select All + Hide</button>
              <button class="similar-close" (click)="showSimilar = false">&times;</button>
            </div>
            <div class="similar-grid">
              @for (p of similarPhotos; track p.id) {
                <div class="similar-thumb" [class.selected]="similarSelected.has(p.id)" (click)="toggleSimilarSelect(p.id)">
                  <img [src]="api.getThumbnailUrl(p.id)" />
                  @if (similarSelected.has(p.id)) {
                    <div class="sim-check">&#10003;</div>
                  }
                </div>
              }
            </div>
            @if (similarSelected.size > 0) {
              <div class="similar-actions">
                <button class="sim-hide-btn" (click)="hideSelectedSimilar()">Hide {{ similarSelected.size }} photos</button>
              </div>
            }
          </div>
        }
        @if (showSimilar && similarPhotos.length === 0 && !similarLoading) {
          <div class="similar-panel">
            <div class="similar-header">
              <span>No similar photos found</span>
              <button class="similar-close" (click)="showSimilar = false">&times;</button>
            </div>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    .lightbox-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-container {
      position: relative;
      display: flex;
      max-width: 98vw;
      max-height: 96vh;
      gap: 0;
    }

    .media-panel {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
    }

    .media {
      max-width: 95vw;
      max-height: 92vh;
      object-fit: contain;
    }

    .info-panel .media {
      max-width: 65vw;
    }

    /* ── Info panel ── */
    .info-panel {
      width: 280px;
      background: #1a1a1a;
      border-left: 1px solid #333;
      padding: 20px;
      overflow-y: auto;
      flex-shrink: 0;

      h3 {
        margin: 0 0 16px;
        font-size: 0.95rem;
        color: #ddd;
      }
    }

    .info-section {
      margin-bottom: 12px;
    }

    .info-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 0.85rem;
      color: #ccc;

      &.path {
        font-size: 0.75rem;
        word-break: break-all;
        color: #888;
      }
    }

    .tag-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }

    .tag-chip {
      background: #2a3a4a;
      border: 1px solid #3a5a7a;
      color: #8ac;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .tag-remove {
      background: none;
      border: none;
      color: #688;
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0;
      line-height: 1;

      &:hover { color: #e88; }
    }

    .tag-input {
      background: none;
      border: 1px solid #444;
      color: #ccc;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      width: 80px;

      &:focus { outline: none; border-color: #666; }
      &::placeholder { color: #555; }
    }

    .map-link {
      color: #6cacf0;
      text-decoration: none;

      &:hover { text-decoration: underline; }
    }

    /* ── Buttons ── */
    .btn-close, .btn-fav, .btn-info, .btn-album, .btn-download, .btn-delete, .btn-reassign, .btn-prev, .btn-next {
      position: absolute;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      color: #fff;
      cursor: pointer;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;

      &:hover { background: rgba(255, 255, 255, 0.15); }
    }

    .btn-close {
      top: 8px;
      right: 8px;
      width: 36px;
      height: 36px;
      font-size: 1.5rem;
      z-index: 10;
    }

    .btn-fav {
      top: 8px;
      right: 52px;
      width: 36px;
      height: 36px;
      font-size: 1.3rem;
      z-index: 10;

      &.active { color: #f5c518; background: rgba(245, 197, 24, 0.15); }
    }

    .btn-info {
      top: 8px;
      right: 96px;
      width: 36px;
      height: 36px;
      font-size: 1.2rem;
      z-index: 10;

      &.active { background: rgba(255, 255, 255, 0.2); }
    }

    .btn-album {
      top: 8px;
      right: 140px;
      width: 36px;
      height: 36px;
      font-size: 1.4rem;
      z-index: 10;

      &.active { background: rgba(255, 255, 255, 0.2); }
    }

    /* ── Album picker ── */
    .btn-rotate {
      top: 8px;
      right: 228px;
      width: 36px;
      height: 36px;
      font-size: 1.3rem;
      z-index: 10;
    }

    .btn-similar {
      top: 8px;
      right: 272px;
      width: 36px;
      height: 36px;
      font-size: 1.1rem;
      z-index: 10;
    }

    .btn-download {
      right: 316px;
      top: 8px;
      right: 184px;
      width: 36px;
      height: 36px;
      font-size: 1.4rem;
      z-index: 10;
      text-decoration: none;
      color: #fff;
    }

    .btn-delete {
      top: 8px;
      right: 316px;
      width: 36px;
      height: 36px;
      font-size: 1.2rem;
      z-index: 10;
      color: #e88;

      &:hover { background: rgba(255, 100, 100, 0.2); }
    }

    .btn-reassign {
      top: 8px;
      right: 360px;
      width: 36px;
      height: 36px;
      font-size: 1.2rem;
      z-index: 10;

      &.active { background: rgba(255, 255, 255, 0.2); }
    }

    .album-picker {
      position: absolute;
      top: 50px;
      right: 140px;
      background: #222;
      border: 1px solid #444;
      border-radius: 8px;
      width: 220px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 20;
    }

    .picker-header {
      padding: 10px 14px;
      font-size: 0.8rem;
      color: #888;
      border-bottom: 1px solid #333;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .picker-empty {
      padding: 16px;
      color: #555;
      text-align: center;
      font-size: 0.85rem;
    }

    .picker-item {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 8px 14px;
      background: none;
      border: none;
      color: #ccc;
      cursor: pointer;
      font-size: 0.85rem;
      text-align: left;

      &:hover { background: #2a2a2a; }

      &.added {
        color: #6cacf0;
      }
    }

    .picker-name { flex: 1; }

    .picker-check {
      color: #6cacf0;
      font-size: 0.9rem;
    }

    /* Reassign picker reuses .album-picker but anchors at the reassign btn */
    .reassign-picker {
      right: 360px;
      width: 260px;
    }

    .picker-section {
      padding: 6px 14px 4px;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #777;
      background: #1a1a1a;
      border-top: 1px solid #2a2a2a;

      &:first-child { border-top: none; }
    }

    .reassign-new-row {
      display: flex;
      gap: 4px;
      padding: 8px 10px 10px;
      align-items: center;
    }

    .reassign-new-input {
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #ddd;
      border-radius: 4px;
      font-size: 0.8rem;

      &:focus { outline: none; border-color: #666; }
    }

    .reassign-new-btn {
      padding: 6px 10px;
      background: #2a3a5a;
      border: 1px solid #3a5a8a;
      color: #cde;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      white-space: nowrap;

      &:hover { background: #3a5a8a; }
    }

    /* ── Similar panel ── */
    .similar-panel {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: #1a1a1a;
      border-top: 1px solid #444;
      max-height: 240px;
      z-index: 15;
      display: flex;
      flex-direction: column;
    }

    .similar-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      font-size: 0.8rem;
      color: #aaa;
      border-bottom: 1px solid #333;
    }

    .similar-select-all {
      background: #2a3a1a;
      border: 1px solid #4a5a2a;
      color: #ac8;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      margin-left: auto;
      &:hover { background: #3a4a2a; }
    }

    .similar-close {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 1.2rem;
      &:hover { color: #fff; }
    }

    .similar-grid {
      display: flex;
      gap: 4px;
      padding: 8px;
      overflow-x: auto;
      flex: 1;
    }

    .similar-thumb {
      position: relative;
      width: 80px;
      height: 80px;
      flex-shrink: 0;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;

      img { width: 100%; height: 100%; object-fit: cover; }
      &.selected { border-color: #3a7bd5; }
    }

    .sim-check {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #3a7bd5;
      color: #fff;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .similar-actions {
      padding: 6px 16px;
      border-top: 1px solid #333;
    }

    .sim-hide-btn {
      background: #3a1a1a;
      border: 1px solid #5a2a2a;
      color: #e88;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      &:hover { background: #4a2a2a; }
    }

    .btn-prev, .btn-next {
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 44px;
      font-size: 2rem;
    }

    .btn-prev { left: 8px; }
    .btn-next { right: 8px; }
  `],
})
export class LightboxComponent implements OnInit, OnDestroy {
  @Input({ required: true }) photo!: Photo;
  @Output() close = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  fullPhoto: Photo | null = null;
  isFavorite = false;
  showInfo = false;
  showAlbumPicker = false;
  albums: Album[] = [];
  addedAlbumIds = new Set<number>();
  photoTags: Array<{ id: number; name: string }> = [];
  showSimilar = false;
  similarLoading = false;
  similarPhotos: Array<{ id: number }> = [];
  similarSelected = new Set<number>();
  hasSamePerson = false;

  // Per-photo face reassignment (only meaningful inside /people detail view)
  activePersonId: number | null = null;
  showReassignPicker = false;
  peopleList: PersonSummary[] = [];
  newReassignName = '';

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private personIdSub: { unsubscribe(): void } | null = null;

  constructor(
    public readonly api: ApiService,
    private readonly selection: SelectionService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.isFavorite = this.photo.is_favorite === 1;
    this.loadFullPhoto();
    this.loadTags();

    this.keyHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': this.close.emit(); break;
        case 'ArrowLeft': this.prev.emit(); break;
        case 'ArrowRight': this.next.emit(); break;
        case 'i': this.toggleInfo(); break;
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // Pick up the current person context if the lightbox was opened from
    // /people. The reassign button stays hidden for non-person contexts.
    this.personIdSub = this.selection.currentPersonId$.subscribe((id) => {
      this.activePersonId = id;
      if (id !== null && this.peopleList.length === 0) {
        this.api.getPeople(true).subscribe({
          next: (people) => { this.peopleList = people; this.cdr.detectChanges(); },
        });
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
    this.personIdSub?.unsubscribe();
  }

  private loadFullPhoto(): void {
    // If the input photo already has full data, use it
    if (this.photo.file_size) {
      this.fullPhoto = this.photo;
      return;
    }

    this.api.getPhoto(this.photo.id).subscribe({
      next: (photo) => {
        this.fullPhoto = photo;
        this.cdr.detectChanges();
      },
    });
  }

  toggleFavorite(): void {
    this.api.toggleFavorite(this.photo.id).subscribe({
      next: (result) => {
        this.isFavorite = result.is_favorite;
        this.photo.is_favorite = result.is_favorite ? 1 : 0;
        this.cdr.detectChanges();
      },
    });
  }

  deletePhoto(): void {
    const id = this.photo.id;
    this.api.trashPhoto(id).subscribe({
      next: (res) => {
        if (!res.moved) {
          this.toast.error('Could not move to trash');
          return;
        }
        this.toast.withAction(
          'Moved to trash',
          'Undo',
          () => {
            this.api.restorePhoto(id).subscribe({
              error: () => this.toast.error('Restore failed'),
            });
          },
        );
        this.next.emit();
      },
      error: () => this.toast.error('Delete failed'),
    });
  }

  toggleInfo(): void {
    this.showInfo = !this.showInfo;
    this.showAlbumPicker = false;
    if (this.showInfo && !this.fullPhoto) {
      this.loadFullPhoto();
    }
  }

  toggleAlbumPicker(): void {
    this.showAlbumPicker = !this.showAlbumPicker;
    this.showInfo = false;
    if (this.showAlbumPicker && this.albums.length === 0) {
      this.api.getAlbums().subscribe({
        next: (albums) => {
          this.albums = albums;
          this.cdr.detectChanges();
        },
      });
    }
  }

  private loadTags(): void {
    this.api.getPhotoTags(this.photo.id).subscribe({
      next: (tags) => { this.photoTags = tags; this.cdr.detectChanges(); },
    });
  }

  addTag(event: Event): void {
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return;

    // Create tag if it doesn't exist, then add to photo
    this.api.createTag(name).subscribe({
      next: (tag) => {
        this.api.addTagToPhotos(tag.id, [this.photo.id]).subscribe({
          next: () => { input.value = ''; this.loadTags(); },
        });
      },
    });
  }

  removeTag(tagId: number): void {
    this.api.removeTagFromPhotos(tagId, [this.photo.id]).subscribe({
      next: () => { this.loadTags(); },
    });
  }

  rotatePhoto(): void {
    this.api.rotatePhoto(this.photo.id, 90).subscribe({
      next: () => {
        // Force reload the thumbnail and full image by cache-busting
        const timestamp = Date.now();
        const img = document.querySelector('.lightbox-content .media') as HTMLImageElement | null;
        if (img && img.src) {
          img.src = this.api.getFileUrl(this.photo.id) + '?t=' + timestamp;
        }
        this.cdr.detectChanges();
      },
    });
  }

  findSimilar(): void {
    this.showSimilar = true;
    this.similarLoading = true;
    this.similarSelected.clear();
    this.similarPhotos = [];

    const ids = new Set<number>();
    const all: Array<{ id: number }> = [];
    let pending = 2;

    const done = (): void => {
      pending--;
      if (pending <= 0) {
        this.similarPhotos = all;
        this.similarLoading = false;
        this.cdr.detectChanges();
      }
    };

    // Same day + same person
    this.api.findSimilar(this.photo.id).subscribe({
      next: (result) => {
        for (const p of result.samePerson) {
          if (!ids.has(p.id)) { ids.add(p.id); all.push(p); }
        }
        for (const p of result.sameDay) {
          if (!ids.has(p.id)) { ids.add(p.id); all.push(p); }
        }
        this.hasSamePerson = result.samePerson.length > 0;
        done();
      },
      error: () => done(),
    });

    // Visual similarity (if embeddings exist)
    this.api.findVisuallySimilar(this.photo.id).subscribe({
      next: (photos) => {
        for (const p of photos) {
          if (!ids.has(p.id)) { ids.add(p.id); all.push(p); }
        }
        done();
      },
      error: () => done(),
    });
  }

  toggleSimilarSelect(id: number): void {
    if (this.similarSelected.has(id)) {
      this.similarSelected.delete(id);
    } else {
      this.similarSelected.add(id);
    }
  }

  selectAllSimilar(): void {
    for (const p of this.similarPhotos) {
      this.similarSelected.add(p.id);
    }
    this.cdr.detectChanges();
  }

  hideSelectedSimilar(): void {
    const ids = [...this.similarSelected];
    if (ids.length === 0) return;
    if (!confirm(`Hide ${ids.length} photos? They'll be removed from timeline/search but kept on disk.`)) return;

    this.api.bulkHide(ids, true).subscribe({
      next: () => {
        this.similarPhotos = this.similarPhotos.filter((p) => !this.similarSelected.has(p.id));
        this.similarSelected.clear();
        this.cdr.detectChanges();
      },
    });
  }

  addToAlbum(album: Album): void {
    if (this.addedAlbumIds.has(album.id)) return;

    this.api.addPhotosToAlbum(album.id, [this.photo.id]).subscribe({
      next: () => {
        this.addedAlbumIds.add(album.id);
        this.cdr.detectChanges();
      },
    });
  }

  toggleReassignPicker(): void {
    this.showReassignPicker = !this.showReassignPicker;
    this.newReassignName = '';
  }

  /** Other people we can reassign this face to (excludes the active person). */
  getReassignTargets(): PersonSummary[] {
    if (!this.activePersonId) return [];
    return this.peopleList.filter((p) => p.id !== this.activePersonId);
  }

  reassignToExisting(toPersonId: number, toName: string | null): void {
    if (!this.activePersonId) return;
    this.api.reassignFaces(this.activePersonId, toPersonId, [this.photo.id]).subscribe({
      next: (res) => {
        this.showReassignPicker = false;
        this.toast.success(`Reassigned ${res.reassigned} face(s) to "${toName ?? 'Unknown'}"`);
        // Trigger a refresh so the /people grid drops this photo (it no longer belongs)
        this.selection.notifyRefresh();
        // Auto-advance — the current photo is gone from the active person's set
        this.next.emit();
      },
      error: () => this.toast.error('Reassign failed'),
    });
  }

  splitToNewPerson(): void {
    if (!this.activePersonId) return;
    const name = this.newReassignName.trim() || null;
    this.api.splitFacesToNewPerson(this.activePersonId, [this.photo.id], name).subscribe({
      next: (res) => {
        this.showReassignPicker = false;
        this.newReassignName = '';
        this.toast.success(`Split ${res.reassigned} face(s) to ${name ? `"${name}"` : 'a new person'}`);
        this.selection.notifyRefresh();
        this.next.emit();
      },
      error: () => this.toast.error('Split failed'),
    });
  }

  formatCamera(make: string | null, model: string | null): string {
    return [make, model].filter((v) => v != null && v.length > 0).join(' ');
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(1)} ${units[i]}`;
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
