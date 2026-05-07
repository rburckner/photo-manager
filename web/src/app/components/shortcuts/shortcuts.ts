import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{ keys: string; description: string }>;
}

@Component({
  selector: 'app-shortcuts',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible) {
      <div class="shortcuts-overlay" (click)="hide()">
        <div class="shortcuts-panel" (click)="$event.stopPropagation()">
          <div class="panel-header">
            <h2>Keyboard Shortcuts</h2>
            <button class="btn-close" (click)="hide()">&times;</button>
          </div>
          <div class="panel-body">
            @for (group of groups; track group.title) {
              <div class="shortcut-group">
                <h3>{{ group.title }}</h3>
                @for (s of group.shortcuts; track s.keys) {
                  <div class="shortcut-row">
                    <span class="keys">
                      @for (key of s.keys.split('+'); track key; let last = $last) {
                        <kbd>{{ key.trim() }}</kbd>
                        @if (!last) { <span class="plus">+</span> }
                      }
                    </span>
                    <span class="desc">{{ s.description }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .shortcuts-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .shortcuts-panel {
      background: #222;
      border: 1px solid #444;
      border-radius: 12px;
      width: 520px;
      max-width: 90vw;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #333;

      h2 { margin: 0; flex: 1; font-size: 1.1rem; color: #ddd; }
    }

    .btn-close {
      background: none; border: none; color: #aaa; font-size: 1.5rem; cursor: pointer;
      &:hover { color: #fff; }
    }

    .panel-body {
      padding: 16px 20px;
      overflow-y: auto;
    }

    .shortcut-group {
      margin-bottom: 16px;
      h3 { margin: 0 0 8px; font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
    }

    .shortcut-row {
      display: flex;
      align-items: center;
      padding: 4px 0;
    }

    .keys {
      width: 160px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    kbd {
      background: #333;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.8rem;
      font-family: monospace;
      color: #ddd;
    }

    .plus { color: #666; font-size: 0.75rem; }
    .desc { font-size: 0.85rem; color: #aaa; }
  `],
})
export class ShortcutsComponent implements OnInit, OnDestroy {
  visible = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  groups: ShortcutGroup[] = [
    {
      title: 'General',
      shortcuts: [
        { keys: '?', description: 'Show keyboard shortcuts' },
        { keys: 'Escape', description: 'Close overlay / exit selection' },
      ],
    },
    {
      title: 'Lightbox',
      shortcuts: [
        { keys: 'ArrowLeft', description: 'Previous photo' },
        { keys: 'ArrowRight', description: 'Next photo' },
        { keys: 'i', description: 'Toggle info panel' },
        { keys: 'Escape', description: 'Close lightbox' },
      ],
    },
    {
      title: 'Selection',
      shortcuts: [
        { keys: 'Ctrl + Click', description: 'Toggle photo selection' },
        { keys: 'Shift + Click', description: 'Select range' },
      ],
    },
    {
      title: 'TV Slideshow',
      shortcuts: [
        { keys: 'Space', description: 'Play / Pause' },
        { keys: 'ArrowLeft', description: 'Previous slide' },
        { keys: 'ArrowRight', description: 'Next slide' },
        { keys: 'Escape', description: 'Exit slideshow' },
      ],
    },
  ];

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === '?' && !this.isInputFocused()) {
        e.preventDefault();
        this.visible = !this.visible;
        this.cdr.detectChanges();
      }
      if (e.key === 'Escape' && this.visible) {
        this.visible = false;
        this.cdr.detectChanges();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  ngOnDestroy(): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }

  hide(): void {
    this.visible = false;
  }

  private isInputFocused(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  }
}
