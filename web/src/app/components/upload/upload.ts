import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DeviceAuthService } from '../../services/device-auth.service';
import { UploadQueueService } from '../../services/upload-queue.service';
import { FolderWatchService } from '../../services/folder-watch.service';
import { ToastService } from '../../services/toast.service';

interface FileItem {
  file: File;
  status: 'pending' | 'hashing' | 'uploading' | 'imported' | 'duplicate' | 'skipped' | 'error';
  hash: string;
  message?: string;
}

const MAX_PARALLEL = 3;

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="upload-container">
      <h2>Upload photos</h2>

      @if (!deviceAuth.isPaired()) {
        <div class="not-paired">
          <p>This device isn't paired yet.</p>
          <a routerLink="/pair" class="btn-primary">Pair this device</a>
        </div>
      } @else {
        <p class="hint">
          Uploading as <strong>{{ deviceAuth.deviceName() }}</strong>.
          Files are hashed locally; duplicates are detected before upload to save bandwidth.
        </p>

        @if (folderWatch.isSupported()) {
          <div class="watch-controls">
            @if (folderWatch.hasWatchedFolder()) {
              <button class="btn-primary" (click)="checkWatchedFolder()" [disabled]="uploading || scanning">
                {{ scanning ? 'Scanning folder…' : 'Check for new photos' }}
              </button>
              <button class="btn-secondary" (click)="changeFolder()" [disabled]="uploading || scanning">
                Change folder
              </button>
            } @else {
              <button class="btn-primary" (click)="pickFolder()" [disabled]="uploading">
                Watch a folder for new photos
              </button>
              <p class="micro-hint">
                Or use the manual picker below if you prefer to upload one batch at a time.
              </p>
            }
          </div>
        }

        <label class="file-picker">
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            (change)="onFilesPicked($event)"
            [disabled]="uploading"
          />
          <span class="picker-label">Choose photos &amp; videos…</span>
        </label>

        @if (items.length > 0) {
          <div class="summary">
            <span>{{ counts.imported }} imported</span>
            <span>{{ counts.duplicate }} duplicates</span>
            <span>{{ counts.error }} failed</span>
            <span class="status">{{ uploading ? 'Uploading…' : (allDone ? 'Done' : 'Ready') }}</span>
          </div>

          <div class="file-list">
            @for (item of items; track item.file.name) {
              <div class="file-row" [class]="'status-' + item.status">
                <span class="file-name">{{ item.file.name }}</span>
                <span class="file-size">{{ formatBytes(item.file.size) }}</span>
                <span class="file-status">{{ statusLabel(item) }}</span>
              </div>
            }
          </div>

          @if (counts.error > 0 && !uploading) {
            <button class="btn-secondary" (click)="retryFailed()">Retry failed</button>
          }
        }
      }
    </div>
  `,
  styles: [`
    .watch-controls {
      margin-top: 16px;
      padding: 16px;
      background: #1e1e1e;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .micro-hint { font-size: 0.75rem; color: #666; margin: 0; }

    .upload-container {
      max-width: 640px;
      margin: 0 auto;
      padding: 24px 16px;
      color: #ddd;
    }
    h2 { margin: 0 0 12px; font-size: 1.3rem; }
    .hint { font-size: 0.85rem; color: #888; line-height: 1.5; }

    .not-paired {
      padding: 24px;
      text-align: center;
      background: #1e1e1e;
      border-radius: 8px;
      margin-top: 16px;
    }

    .file-picker {
      display: block;
      margin-top: 16px;
      padding: 24px;
      border: 2px dashed #444;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s;

      &:hover { border-color: #666; }

      input { display: none; }
      .picker-label { color: #aaa; font-size: 0.9rem; }
    }

    .summary {
      display: flex;
      gap: 16px;
      padding: 12px;
      background: #1e1e1e;
      border-radius: 6px;
      margin-top: 16px;
      font-size: 0.85rem;
      flex-wrap: wrap;

      .status { margin-left: auto; color: #8ac; }
    }

    .file-list { margin-top: 12px; max-height: 50vh; overflow-y: auto; }
    .file-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 12px;
      font-size: 0.8rem;
      border-bottom: 1px solid #2a2a2a;

      .file-name { flex: 1; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .file-size { color: #666; font-size: 0.7rem; }
      .file-status { width: 100px; text-align: right; color: #888; }

      &.status-imported .file-status { color: #8c8; }
      &.status-duplicate .file-status { color: #cc8; }
      &.status-error .file-status { color: #e88; }
      &.status-uploading .file-status { color: #8ac; }
    }

    .btn-primary, .btn-secondary {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      text-decoration: none;
      margin-top: 12px;
      border: 1px solid;
    }
    .btn-primary {
      background: #2a3a5a;
      border-color: #3a5a8a;
      color: #fff;
      &:hover { background: #3a4a6a; }
    }
    .btn-secondary {
      background: #2a2a2a;
      border-color: #444;
      color: #ccc;
      &:hover { background: #333; }
    }
  `],
})
export class UploadComponent implements OnInit {
  items: FileItem[] = [];
  uploading = false;
  scanning = false;

  constructor(
    public readonly deviceAuth: DeviceAuthService,
    public readonly folderWatch: FolderWatchService,
    private readonly api: ApiService,
    private readonly queue: UploadQueueService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.deviceAuth.isPaired()) return;

    // First, retry any uploads queued from a prior session (Background Sync
    // SW also tries, but we drain in-page for browsers that don't support it
    // and to give immediate visual feedback when the user opens the app).
    void this.drainPersistentQueue();

    // Then, if a folder is being watched, scan it for newly-added photos.
    if (this.folderWatch.hasWatchedFolder()) {
      void this.checkWatchedFolder();
    }
  }

  private async drainPersistentQueue(): Promise<void> {
    const queued = await this.queue.getAll();
    if (queued.length === 0) return;
    const queuedItems: FileItem[] = queued.map((q) => ({
      file: new File([q.blob], q.fileName, { type: q.blob.type }),
      status: 'pending' as const,
      hash: q.hash,
    }));
    this.items = [...queuedItems, ...this.items];
    void this.runUploads();
  }

  async pickFolder(): Promise<void> {
    const ok = await this.folderWatch.pickFolder();
    if (ok) {
      this.toast.success('Folder watched. Scanning for new photos…');
      await this.checkWatchedFolder();
    }
  }

  async changeFolder(): Promise<void> {
    if (!confirm('Pick a different folder to watch? Already-uploaded photos in the current folder will not be re-uploaded.')) return;
    await this.folderWatch.clearWatchedFolder();
    await this.pickFolder();
  }

  async checkWatchedFolder(): Promise<void> {
    if (this.scanning || this.uploading) return;
    this.scanning = true;
    this.cdr.detectChanges();
    try {
      const newFiles = await this.folderWatch.getNewFiles();
      if (newFiles === null) {
        this.toast.error('Folder permission was revoked. Pick the folder again.');
        return;
      }
      if (newFiles.length === 0) {
        this.toast.info('No new photos.');
        return;
      }
      this.items = newFiles.map((file) => ({ file, status: 'pending' as const, hash: '' }));
      void this.runUploads();
    } finally {
      this.scanning = false;
      this.cdr.detectChanges();
    }
  }

  get counts(): { imported: number; duplicate: number; error: number } {
    return {
      imported: this.items.filter((i) => i.status === 'imported').length,
      duplicate: this.items.filter((i) => i.status === 'duplicate').length,
      error: this.items.filter((i) => i.status === 'error').length,
    };
  }

  get allDone(): boolean {
    return this.items.length > 0 && this.items.every(
      (i) => i.status === 'imported' || i.status === 'duplicate' || i.status === 'error' || i.status === 'skipped',
    );
  }

  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;

    this.items = files.map((file) => ({ file, status: 'pending' as const, hash: '' }));
    void this.runUploads();
    input.value = ''; // allow re-picking same files
  }

  retryFailed(): void {
    this.items = this.items.map((i) => i.status === 'error' ? { ...i, status: 'pending', message: undefined } : i);
    void this.runUploads();
  }

  statusLabel(item: FileItem): string {
    switch (item.status) {
      case 'pending': return 'Waiting';
      case 'hashing': return 'Hashing…';
      case 'uploading': return 'Uploading…';
      case 'imported': return 'Imported';
      case 'duplicate': return 'Duplicate';
      case 'skipped': return 'Skipped';
      case 'error': return item.message ?? 'Failed';
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  private async runUploads(): Promise<void> {
    const apiKey = this.deviceAuth.apiKey();
    if (!apiKey) {
      this.toast.error('Not paired');
      void this.router.navigate(['/pair']);
      return;
    }

    this.uploading = true;
    this.cdr.detectChanges();

    const pending = () => this.items.filter((i) => i.status === 'pending');

    // Simple parallel pool
    const workers: Promise<void>[] = [];
    for (let i = 0; i < MAX_PARALLEL; i++) {
      workers.push(this.workerLoop(apiKey, pending));
    }
    await Promise.all(workers);

    this.uploading = false;
    this.cdr.detectChanges();
  }

  private async workerLoop(apiKey: string, getPending: () => FileItem[]): Promise<void> {
    while (true) {
      const next = getPending()[0];
      if (!next) return;
      next.status = 'hashing';
      this.cdr.detectChanges();
      try {
        const buf = new Uint8Array(await next.file.arrayBuffer());
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        next.hash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        // Skip the upload entirely if the server already has this hash.
        const check = await this.api.checkUploadHash(next.hash, apiKey).toPromise();
        if (check?.exists) {
          next.status = 'duplicate';
          await this.queue.dequeue(next.hash);
          await this.folderWatch.markFingerprintSeen(next.file);
          this.cdr.detectChanges();
          continue;
        }

        next.status = 'uploading';
        this.cdr.detectChanges();

        const res = await this.api.uploadPhoto(next.file, apiKey).toPromise();
        if (res?.action === 'imported') {
          next.status = 'imported';
          await this.queue.dequeue(next.hash);
          await this.folderWatch.markFingerprintSeen(next.file);
        } else if (res?.action === 'duplicate') {
          next.status = 'duplicate';
          await this.queue.dequeue(next.hash);
          await this.folderWatch.markFingerprintSeen(next.file);
        } else if (res?.action === 'skipped') {
          next.status = 'skipped';
        } else {
          next.status = 'error';
          next.message = res?.error ?? 'Upload failed';
          await this.queue.enqueue(next.file, next.hash);
        }
      } catch (err) {
        next.status = 'error';
        next.message = err instanceof Error ? err.message : 'Failed';
        if (next.hash) await this.queue.enqueue(next.file, next.hash);
      } finally {
        this.cdr.detectChanges();
      }
    }
  }
}
