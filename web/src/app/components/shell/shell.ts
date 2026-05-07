import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
          <li>
            <a routerLink="/folders" routerLinkActive="active">
              <span class="icon">&#128193;</span>
              Folders
            </a>
          </li>
          <li>
            <a routerLink="/albums" routerLinkActive="active">
              <span class="icon">&#128218;</span>
              Albums
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
        </ul>
      </nav>
      <main class="content">
        <router-outlet />
      </main>
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
  `],
})
export class ShellComponent {}
