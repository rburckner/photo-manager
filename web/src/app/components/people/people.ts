import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-people',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="people-container">
      <h2>People</h2>
      <div class="coming-soon">
        <div class="icon">&#128100;</div>
        <h3>Face Detection Coming Soon</h3>
        <p>This feature will scan your photos for faces, cluster them by person,
           and let you name, ignore, or hide individuals.</p>
        <div class="feature-list">
          <div class="feature">
            <strong>Name</strong>
            <span>Identify family members — click their face to see all their photos</span>
          </div>
          <div class="feature">
            <strong>Ignore</strong>
            <span>Dismiss strangers and background faces from the People view</span>
          </div>
          <div class="feature">
            <strong>Hide</strong>
            <span>Filter someone out of timeline and albums, but keep all files</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .people-container {
      height: 100vh;
      overflow-y: auto;
      padding: 20px;

      h2 { margin: 0 0 24px; color: #ddd; font-size: 1.2rem; }
    }

    .coming-soon {
      text-align: center;
      padding: 60px 20px;
      max-width: 500px;
      margin: 0 auto;
    }

    .icon {
      font-size: 4rem;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    h3 {
      color: #ccc;
      font-size: 1.1rem;
      margin: 0 0 8px;
    }

    p {
      color: #888;
      font-size: 0.9rem;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .feature-list {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .feature {
      background: #222;
      border-radius: 8px;
      padding: 12px 16px;

      strong {
        display: block;
        color: #ddd;
        font-size: 0.85rem;
        margin-bottom: 2px;
      }

      span {
        font-size: 0.8rem;
        color: #888;
      }
    }
  `],
})
export class PeopleComponent {}
