import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SelectionBarComponent } from '../selection-bar/selection-bar';
import { ShortcutsComponent } from '../shortcuts/shortcuts';
import { ToastComponent } from '../toast/toast';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, SelectionBarComponent, ShortcutsComponent, ToastComponent],
  template: `
    <div class="shell">
      <nav class="sidebar">
        <div class="logo">
          <h1>Photos</h1>
        </div>
        <ul class="nav-links">
          <li>
            <a routerLink="/timeline" routerLinkActive="active">
              <span class="icon">&#128197;</span>
              Timeline
            </a>
          </li>
          @if (showFolders) {
            <li>
              <a routerLink="/folders" routerLinkActive="active">
                <span class="icon">&#128193;</span>
                Folders
              </a>
            </li>
          }
          <li>
            <a routerLink="/albums" routerLinkActive="active">
              <span class="icon">&#128218;</span>
              Albums
            </a>
          </li>
          <li>
            <a routerLink="/people" routerLinkActive="active">
              <span class="icon">&#128100;</span>
              People
            </a>
          </li>
          <li>
            <a routerLink="/map" routerLinkActive="active">
              <span class="icon">&#127758;</span>
              Map
            </a>
          </li>
          <li>
            <a routerLink="/search" routerLinkActive="active">
              <span class="icon">&#128269;</span>
              Search
            </a>
          </li>
          <li>
            <a routerLink="/favorites" routerLinkActive="active">
              <span class="icon">&#9733;</span>
              Favorites
            </a>
          </li>
          <li>
            <a routerLink="/stats" routerLinkActive="active">
              <span class="icon">&#128200;</span>
              Stats
            </a>
          </li>
          <li>
            <a routerLink="/settings" routerLinkActive="active">
              <span class="icon">&#9881;</span>
              Settings
            </a>
          </li>
        </ul>
      </nav>
      <main class="content">
        <app-selection-bar />
        <router-outlet />
      </main>
      <app-shortcuts />
      <app-toast />
    </div>
  `,
  styles: [`
    .shell {
      display: flex;
      height: 100vh;
      background: #1a1a1a;
      color: #e0e0e0;
    }

    .sidebar {
      width: 220px;
      background: #111;
      border-right: 1px solid #333;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .logo {
      padding: 20px;
      border-bottom: 1px solid #333;

      h1 {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 600;
        color: #fff;
      }
    }

    .nav-links {
      list-style: none;
      padding: 8px;
      margin: 0;

      li a {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 8px;
        color: #aaa;
        text-decoration: none;
        font-size: 0.9rem;
        transition: background 0.15s, color 0.15s;

        &:hover {
          background: #222;
          color: #fff;
        }

        &.active {
          background: #2a2a2a;
          color: #fff;
        }
      }

      .icon {
        font-size: 1.1rem;
      }
    }

    .content {
      flex: 1;
      overflow-y: auto;
    }

    /* ── Mobile responsive ── */
    @media (max-width: 768px) {
      .shell {
        flex-direction: column;
      }

      .sidebar {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid #333;
        flex-direction: row;
        overflow-x: auto;
      }

      .logo {
        padding: 10px 16px;
        border-bottom: none;
        border-right: 1px solid #333;
        display: flex;
        align-items: center;

        h1 { font-size: 1rem; white-space: nowrap; }
      }

      .nav-links {
        display: flex;
        flex-direction: row;
        padding: 4px;
        gap: 2px;
        overflow-x: auto;

        li a {
          padding: 8px 10px;
          white-space: nowrap;
          font-size: 0.8rem;
        }
      }
    }
  `],
})
export class ShellComponent implements OnInit {
  showFolders = true;

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.api.getSettings().subscribe({
      next: (settings) => {
        this.showFolders = settings['show_folders_nav'] !== 'false';
      },
    });
  }
}
