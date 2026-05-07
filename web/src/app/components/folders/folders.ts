import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { LightboxComponent } from '../lightbox/lightbox';
import type { FolderTreeNode, FolderEntry, Photo } from '../../models/photo.model';

@Component({
  selector: 'app-folders',
  standalone: true,
  imports: [CommonModule, LightboxComponent],
  template: `
    <div class="folders-layout">
      <!-- Folder tree -->
      <div class="folder-tree">
        <div class="tree-header">
          <h3>Folders</h3>
          <span class="folder-count">{{ totalFolders }} folders</span>
        </div>
        <div class="tree-scroll">
          @if (loading) {
            <div class="tree-loading">Loading folders...</div>
          }
          <ng-container *ngTemplateOutlet="treeNodes; context: { nodes: tree }"></ng-container>
        </div>
      </div>

      <!-- Photo grid for selected folder -->
      <div class="folder-content">
        @if (selectedFolder) {
          <div class="content-header">
            <h2>{{ selectedFolder }}</h2>
            <span class="photo-count">{{ totalPhotos }} items</span>
            <div class="sort-controls">
              <select class="sort-select" [value]="sortBy" (change)="onSortChange($event)">
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="camera">Camera</option>
              </select>
              <button class="sort-order" (click)="toggleSortOrder()">
                {{ sortOrder === 'desc' ? '&#9660;' : '&#9650;' }}
              </button>
            </div>
          </div>
          <div class="photo-grid" (scroll)="onScroll($event)">
            @for (photo of photos; track photo.id) {
              <div
                class="photo-card"
                [class.video]="photo.is_video === 1"
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
                  [src]="getThumbnailUrl(photo.id)"
                  [alt]="photo.file_name"
                  loading="lazy"
                  (error)="onImageError($event)"
                />
                @if (photo.is_video === 1) {
                  <div class="video-badge">&#9654;</div>
                }
              </div>
            }

            @if (loadingPhotos) {
              <div class="grid-loading">Loading...</div>
            }
          </div>
        } @else {
          <div class="no-selection">
            <p>Select a folder to browse photos</p>
          </div>
        }
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

    <!-- Recursive tree node template -->
    <ng-template #treeNodes let-nodes="nodes">
      @for (node of nodes; track node.path) {
        <div class="tree-node">
          <div
            class="tree-item"
            [class.selected]="selectedFolder === node.path"
            [class.has-children]="node.children.length > 0"
            [style.padding-left.px]="getDepth(node.path) * 16 + 8"
            (click)="selectFolder(node)"
          >
            @if (node.children.length > 0) {
              <span
                class="toggle"
                (click)="toggleNode(node, $event)"
              >{{ node.expanded ? '&#9662;' : '&#9656;' }}</span>
            } @else {
              <span class="toggle-spacer"></span>
            }
            <span class="folder-icon">&#128193;</span>
            <span class="folder-name">{{ node.name }}</span>
            <span class="item-count">{{ node.count }}</span>
          </div>
          @if (node.expanded && node.children.length > 0) {
            <ng-container *ngTemplateOutlet="treeNodes; context: { nodes: node.children }"></ng-container>
          }
        </div>
      }
    </ng-template>
  `,
  styles: [`
    .folders-layout {
      display: flex;
      height: 100vh;
    }

    /* ── Tree panel ── */
    .folder-tree {
      width: 300px;
      background: #151515;
      border-right: 1px solid #333;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .tree-header {
      padding: 14px 16px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: baseline;
      gap: 8px;

      h3 { margin: 0; font-size: 1rem; color: #ddd; }
      .folder-count { font-size: 0.75rem; color: #666; }
    }

    .tree-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .tree-loading {
      padding: 20px;
      color: #666;
      text-align: center;
    }

    .tree-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 0.82rem;
      color: #aaa;
      transition: background 0.1s;
      white-space: nowrap;

      &:hover {
        background: #222;
        color: #ddd;
      }

      &.selected {
        background: #2a2a2a;
        color: #fff;
      }
    }

    .toggle {
      width: 16px;
      text-align: center;
      font-size: 0.7rem;
      cursor: pointer;
      flex-shrink: 0;
    }

    .toggle-spacer {
      width: 16px;
      flex-shrink: 0;
    }

    .folder-icon {
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .folder-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-count {
      font-size: 0.7rem;
      color: #555;
      flex-shrink: 0;
    }

    /* ── Content panel ── */
    .folder-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .content-header {
      padding: 14px 20px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: baseline;
      gap: 10px;

      h2 { margin: 0; font-size: 1rem; color: #ddd; font-weight: 500; }
      .photo-count { font-size: 0.8rem; color: #666; }
    }

    .sort-controls {
      display: flex; align-items: center; gap: 4px; margin-left: auto;
    }
    .sort-select {
      background: #222; border: 1px solid #444; color: #e0e0e0;
      padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; cursor: pointer;
    }
    .sort-order {
      background: #222; border: 1px solid #444; color: #aaa;
      padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;
      &:hover { background: #333; }
    }

    .photo-grid {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 4px;
      align-content: start;
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

      &:hover img {
        transform: scale(1.05);
      }
    }

    .video-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .grid-loading {
      grid-column: 1 / -1;
      text-align: center;
      padding: 20px;
      color: #666;
    }

    .no-selection {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
    }

  `],
})
export class FoldersComponent implements OnInit, OnDestroy {
  tree: FolderTreeNode[] = [];
  loading = true;
  totalFolders = 0;

  selectedFolder: string | null = null;
  photos: Photo[] = [];
  loadingPhotos = false;
  totalPhotos = 0;
  sortBy = 'date';
  sortOrder: 'asc' | 'desc' = 'desc';
  currentPage = 1;
  hasMorePhotos = true;

  selectedPhoto: Photo | null = null;

  private lastClickedId: number | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
    public readonly selection: SelectionService,
  ) {}

  ngOnInit(): void {
    this.api.getFolders().subscribe({
      next: (folders) => {
        this.tree = this.buildTree(folders);
        this.totalFolders = folders.length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
      },
    });

    window.addEventListener('keydown', this.onKeydown);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeydown);
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closeLightbox();
  };

  buildTree(folders: FolderEntry[]): FolderTreeNode[] {
    const root: FolderTreeNode[] = [];
    const nodeMap = new Map<string, FolderTreeNode>();

    // Sort folders so parents come before children
    const sorted = [...folders].sort((a, b) => a.folder_path.localeCompare(b.folder_path));

    for (const folder of sorted) {
      const parts = folder.folder_path.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!nodeMap.has(currentPath)) {
          const node: FolderTreeNode = {
            name: part,
            path: currentPath,
            count: 0,
            children: [],
            expanded: i === 0, // Expand top-level by default
          };
          nodeMap.set(currentPath, node);

          // Attach to parent or root
          const parentPath = parts.slice(0, i).join('/');
          if (parentPath && nodeMap.has(parentPath)) {
            nodeMap.get(parentPath)!.children.push(node);
          } else if (i === 0) {
            root.push(node);
          }
        }

        // Set count on the leaf node
        if (i === parts.length - 1) {
          nodeMap.get(currentPath)!.count = folder.count;
        }
      }
    }

    // Roll up counts to parent nodes
    this.rollUpCounts(root);

    return root;
  }

  private rollUpCounts(nodes: FolderTreeNode[]): number {
    let total = 0;
    for (const node of nodes) {
      if (node.children.length > 0) {
        const childCount = this.rollUpCounts(node.children);
        node.count = node.count + childCount;
      }
      total += node.count;
    }
    return total;
  }

  selectFolder(node: FolderTreeNode): void {
    this.selectedFolder = node.path;
    this.photos = [];
    this.currentPage = 1;
    this.hasMorePhotos = true;
    this.loadPhotos();

    // Auto-expand when selecting
    if (node.children.length > 0) {
      node.expanded = true;
    }
  }

  toggleNode(node: FolderTreeNode, event: Event): void {
    event.stopPropagation();
    node.expanded = !node.expanded;
  }

  onSortChange(event: Event): void {
    this.sortBy = (event.target as HTMLSelectElement).value;
    this.photos = [];
    this.currentPage = 1;
    this.hasMorePhotos = true;
    this.loadPhotos();
  }

  toggleSortOrder(): void {
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
    this.photos = [];
    this.currentPage = 1;
    this.hasMorePhotos = true;
    this.loadPhotos();
  }

  loadPhotos(): void {
    if (this.loadingPhotos || !this.hasMorePhotos || !this.selectedFolder) return;

    this.loadingPhotos = true;
    this.api.getPhotos(this.currentPage, 100, this.selectedFolder, this.sortBy, this.sortOrder).subscribe({
      next: (response) => {
        this.photos.push(...response.photos);
        this.totalPhotos = response.pagination.total;
        this.hasMorePhotos = this.currentPage < response.pagination.totalPages;
        this.currentPage++;
        this.loadingPhotos = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingPhotos = false;
      },
    });
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) {
      this.loadPhotos();
    }
  }

  getDepth(path: string): number {
    return path.split('/').length - 1;
  }

  onPhotoClick(photo: Photo, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    if (event.shiftKey && this.lastClickedId !== null && this.selection.isSelecting) {
      const startIdx = this.photos.findIndex((p) => p.id === this.lastClickedId);
      const endIdx = this.photos.findIndex((p) => p.id === photo.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const rangeIds = this.photos.slice(from, to + 1).map((p) => p.id);
        this.selection.selectAll(rangeIds);
      }
      return;
    }
    if (this.selection.isSelecting) {
      this.selection.toggle(photo.id);
      this.lastClickedId = photo.id;
      return;
    }
    this.openPhoto(photo);
  }

  openPhoto(photo: Photo): void {
    this.selectedPhoto = photo;
  }

  closeLightbox(): void {
    this.selectedPhoto = null;
  }

  navigatePhoto(direction: number): void {
    if (!this.selectedPhoto) return;
    const idx = this.photos.findIndex((p) => p.id === this.selectedPhoto!.id);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < this.photos.length) {
      this.selectedPhoto = this.photos[newIdx]!;
    }
  }

  getThumbnailUrl(id: number): string {
    return this.api.getThumbnailUrl(id);
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
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
}
