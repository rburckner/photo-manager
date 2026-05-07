import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { Photo } from '../../models/photo.model';

interface Tag {
  id: number;
  name: string;
  color: string | null;
  photo_count: number;
}

@Component({
  selector: 'app-tags',
  standalone: true,
  imports: [CommonModule, FormsModule, LightboxComponent],
  template: `
    <div class="tags-container">
      <div class="tags-header">
        <h2>Tags</h2>
        <div class="new-tag">
          <input
            type="text"
            [(ngModel)]="newTagName"
            placeholder="New tag..."
            class="tag-name-input"
            (keydown.enter)="createTag()"
          />
          <button class="btn-create" (click)="createTag()" [disabled]="!newTagName.trim()">Create</button>
        </div>
      </div>

      <div class="tags-layout">
        <div class="tag-list">
          @for (tag of tags; track tag.id) {
            <div
              class="tag-item"
              [class.selected]="selectedTag?.id === tag.id"
              (click)="selectTag(tag)"
            >
              <span class="tag-name">{{ tag.name }}</span>
              <span class="tag-count">{{ tag.photo_count }}</span>
              <button class="btn-delete" (click)="deleteTag(tag, $event)">&times;</button>
            </div>
          }
          @if (tags.length === 0) {
            <div class="no-tags">No tags yet. Create one above or add tags from the photo lightbox.</div>
          }
        </div>

        <div class="tag-photos">
          @if (selectedTag) {
            <div class="photos-header">
              <h3>{{ selectedTag.name }}</h3>
              <span class="count">{{ tagPhotoTotal }} photos</span>
            </div>
            <div class="photo-grid" (scroll)="onScroll($event)">
              @for (photo of tagPhotos; track photo.id) {
                <div class="photo-card" (click)="openPhoto(photo)">
                  <img [src]="api.getThumbnailUrl(photo.id)" loading="lazy" (error)="onImageError($event)" />
                </div>
              }
            </div>
          } @else {
            <div class="no-selection">Select a tag to view photos</div>
          }
        </div>
      </div>
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
    .tags-container {
      height: 100vh; display: flex; flex-direction: column;
      h2 { margin: 0; font-size: 1.1rem; color: #ddd; }
    }

    .tags-header {
      padding: 14px 20px;
      border-bottom: 1px solid #333;
      display: flex; align-items: center; gap: 16px;
    }

    .new-tag { display: flex; gap: 6px; margin-left: auto; }

    .tag-name-input {
      background: #222; border: 1px solid #444; color: #e0e0e0;
      padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;
      &:focus { outline: none; border-color: #666; }
    }

    .btn-create {
      background: #333; border: 1px solid #555; color: #ddd;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
      &:hover { background: #444; }
      &:disabled { opacity: 0.4; }
    }

    .tags-layout { flex: 1; display: flex; overflow: hidden; }

    .tag-list {
      width: 240px; border-right: 1px solid #333; overflow-y: auto; padding: 8px;
    }

    .tag-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 6px; cursor: pointer;
      &:hover { background: #222; }
      &.selected { background: #2a2a2a; }
    }

    .tag-name { flex: 1; font-size: 0.9rem; color: #ccc; }
    .tag-count { font-size: 0.75rem; color: #666; }

    .btn-delete {
      background: none; border: none; color: #555; cursor: pointer;
      font-size: 1rem; opacity: 0; transition: opacity 0.15s;
      .tag-item:hover & { opacity: 1; }
      &:hover { color: #e88; }
    }

    .no-tags { padding: 20px; color: #666; font-size: 0.85rem; }

    .tag-photos { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .photos-header {
      padding: 12px 20px; border-bottom: 1px solid #2a2a2a;
      display: flex; align-items: baseline; gap: 8px;
      h3 { margin: 0; font-size: 1rem; color: #ddd; }
      .count { font-size: 0.75rem; color: #666; }
    }

    .photo-grid {
      flex: 1; overflow-y: auto; padding: 12px;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px; align-content: start;
    }

    .photo-card {
      aspect-ratio: 1; overflow: hidden; border-radius: 4px; cursor: pointer; background: #222;
      img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
      &:hover img { transform: scale(1.05); }
    }

    .no-selection { flex: 1; display: flex; align-items: center; justify-content: center; color: #555; }
  `],
})
export class TagsComponent implements OnInit {
  tags: Tag[] = [];
  newTagName = '';
  selectedTag: Tag | null = null;
  tagPhotos: Photo[] = [];
  tagPhotoTotal = 0;
  tagPhotoPage = 1;
  hasMore = true;
  selectedPhoto: Photo | null = null;

  constructor(public readonly api: ApiService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadTags(); }

  loadTags(): void {
    this.api.getTags().subscribe({ next: (t) => { this.tags = t; this.cdr.detectChanges(); } });
  }

  createTag(): void {
    const name = this.newTagName.trim();
    if (!name) return;
    this.api.createTag(name).subscribe({ next: () => { this.newTagName = ''; this.loadTags(); } });
  }

  deleteTag(tag: Tag, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    this.api.deleteTag(tag.id).subscribe({ next: () => {
      if (this.selectedTag?.id === tag.id) { this.selectedTag = null; this.tagPhotos = []; }
      this.loadTags();
    }});
  }

  selectTag(tag: Tag): void {
    this.selectedTag = tag;
    this.tagPhotos = [];
    this.tagPhotoPage = 1;
    this.hasMore = true;
    this.loadTagPhotos();
  }

  loadTagPhotos(): void {
    if (!this.hasMore || !this.selectedTag) return;
    this.api.getTagPhotos(this.selectedTag.id, this.tagPhotoPage).subscribe({
      next: (r) => {
        this.tagPhotos.push(...r.photos);
        this.tagPhotoTotal = r.pagination.total;
        this.hasMore = this.tagPhotoPage < r.pagination.totalPages;
        this.tagPhotoPage++;
        this.cdr.detectChanges();
      },
    });
  }

  onScroll(e: Event): void {
    const el = e.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) this.loadTagPhotos();
  }

  openPhoto(p: Photo): void { this.selectedPhoto = p; }
  closeLightbox(): void { this.selectedPhoto = null; }
  navigatePhoto(d: number): void {
    if (!this.selectedPhoto) return;
    const i = this.tagPhotos.findIndex((p) => p.id === this.selectedPhoto!.id) + d;
    if (i >= 0 && i < this.tagPhotos.length) this.selectedPhoto = this.tagPhotos[i]!;
  }
  onImageError(e: Event): void { (e.target as HTMLImageElement).style.display = 'none'; }
}
