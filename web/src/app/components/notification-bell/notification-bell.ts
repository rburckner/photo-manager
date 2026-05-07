import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string | null;
  read: number;
  created_at: string;
}

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bell-container">
      <button class="bell-btn" (click)="togglePanel()">
        &#128276;
        @if (unreadCount > 0) {
          <span class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        }
      </button>

      @if (showPanel) {
        <div class="notif-panel">
          <div class="panel-header">
            <span>Notifications</span>
            @if (unreadCount > 0) {
              <button class="mark-read" (click)="markAllRead()">Mark all read</button>
            }
          </div>
          <div class="panel-list">
            @for (n of notifications; track n.id) {
              <div class="notif-item" [class.unread]="n.read === 0" (click)="markRead(n)">
                <div class="notif-title">{{ n.title }}</div>
                @if (n.message) {
                  <div class="notif-msg">{{ n.message }}</div>
                }
                <div class="notif-time">{{ formatTime(n.created_at) }}</div>
              </div>
            }
            @if (notifications.length === 0) {
              <div class="notif-empty">No notifications</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .bell-container { position: relative; }

    .bell-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 4px 8px;
      position: relative;

      &:hover { color: #fff; }
    }

    .badge {
      position: absolute;
      top: 0;
      right: 0;
      background: #e55;
      color: #fff;
      font-size: 0.6rem;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }

    .notif-panel {
      position: absolute;
      top: 100%;
      right: 0;
      background: #222;
      border: 1px solid #444;
      border-radius: 8px;
      width: 320px;
      max-height: 400px;
      z-index: 300;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid #333;
      font-size: 0.85rem;
      color: #ddd;
    }

    .mark-read {
      background: none;
      border: none;
      color: #6cacf0;
      cursor: pointer;
      font-size: 0.75rem;
      &:hover { text-decoration: underline; }
    }

    .panel-list {
      overflow-y: auto;
      flex: 1;
    }

    .notif-item {
      padding: 10px 14px;
      border-bottom: 1px solid #2a2a2a;
      cursor: pointer;
      transition: background 0.1s;

      &:hover { background: #2a2a2a; }
      &.unread { border-left: 3px solid #3a7bd5; }
    }

    .notif-title { font-size: 0.85rem; color: #ddd; }
    .notif-msg { font-size: 0.75rem; color: #888; margin-top: 2px; }
    .notif-time { font-size: 0.65rem; color: #555; margin-top: 4px; }
    .notif-empty { padding: 20px; text-align: center; color: #555; font-size: 0.85rem; }
  `],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  unreadCount = 0;
  showPanel = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadUnreadCount();
    this.pollTimer = setInterval(() => this.loadUnreadCount(), 30000); // Poll every 30s
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  loadUnreadCount(): void {
    this.api.getUnreadCount().subscribe({
      next: (r) => { this.unreadCount = r.count; this.cdr.detectChanges(); },
    });
  }

  togglePanel(): void {
    this.showPanel = !this.showPanel;
    if (this.showPanel) {
      this.api.getNotifications().subscribe({
        next: (n) => { this.notifications = n; this.cdr.detectChanges(); },
      });
    }
  }

  markRead(n: Notification): void {
    if (n.read === 0) {
      this.api.markNotificationRead(n.id).subscribe({
        next: () => {
          n.read = 1;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.cdr.detectChanges();
        },
      });
    }
  }

  markAllRead(): void {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifications.forEach((n) => n.read = 1);
        this.unreadCount = 0;
        this.cdr.detectChanges();
      },
    });
  }

  formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString();
  }
}
