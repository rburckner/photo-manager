import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="help-container">
      <h2>Help</h2>

      <div class="help-section">
        <h3>Keyboard Shortcuts</h3>
        <p class="hint">Press <kbd>?</kbd> anywhere to show/hide the shortcuts overlay</p>
        <table class="shortcut-table">
          <tbody>
            <tr><th colspan="2">General</th></tr>
            <tr><td><kbd>?</kbd></td><td>Show keyboard shortcuts overlay</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Close overlay / exit selection mode</td></tr>

            <tr><th colspan="2">Lightbox (photo viewer)</th></tr>
            <tr><td><kbd>&larr;</kbd></td><td>Previous photo</td></tr>
            <tr><td><kbd>&rarr;</kbd></td><td>Next photo</td></tr>
            <tr><td><kbd>i</kbd></td><td>Toggle info panel (EXIF, camera, GPS)</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Close lightbox</td></tr>

            <tr><th colspan="2">Photo Selection</th></tr>
            <tr><td><kbd>Ctrl</kbd> + click</td><td>Toggle photo selection</td></tr>
            <tr><td><kbd>Shift</kbd> + click</td><td>Select range of photos</td></tr>

            <tr><th colspan="2">TV Slideshow</th></tr>
            <tr><td><kbd>Space</kbd></td><td>Play / Pause</td></tr>
            <tr><td><kbd>&larr;</kbd></td><td>Previous slide</td></tr>
            <tr><td><kbd>&rarr;</kbd></td><td>Next slide</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Exit slideshow</td></tr>
          </tbody>
        </table>
      </div>

      <div class="help-section">
        <h3>Navigation</h3>
        <table class="feature-table">
          <tbody>
            <tr><td><strong>Timeline</strong></td><td>Browse photos by date. Use year pills or date pickers to filter.</td></tr>
            <tr><td><strong>Folders</strong></td><td>Browse the NAS folder structure. Toggle in Settings.</td></tr>
            <tr><td><strong>Albums</strong></td><td>Create albums and add photos from the lightbox (+) button.</td></tr>
            <tr><td><strong>People</strong></td><td>Face detection clusters. Name, ignore, or hide people.</td></tr>
            <tr><td><strong>Map</strong></td><td>GPS-tagged photos on OpenStreetMap with date filter.</td></tr>
            <tr><td><strong>Search</strong></td><td>Search by filename, folder path, or camera model.</td></tr>
            <tr><td><strong>Tags</strong></td><td>Create tags and add them from the lightbox info panel.</td></tr>
            <tr><td><strong>Favorites</strong></td><td>Photos you've starred. Star from the lightbox.</td></tr>
            <tr><td><strong>Stats</strong></td><td>Collection statistics: photos by year, camera, file type.</td></tr>
            <tr><td><strong>Settings</strong></td><td>TV services, face scan, thumbnails, ingestion, cleanup, nav toggles.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="help-section">
        <h3>Lightbox Actions</h3>
        <table class="feature-table">
          <tbody>
            <tr><td>&#9733; Star</td><td>Toggle favorite</td></tr>
            <tr><td>&#9432; Info</td><td>EXIF data, camera, lens, resolution, GPS link</td></tr>
            <tr><td>+ Album</td><td>Add to an album</td></tr>
            <tr><td>&#8615; Download</td><td>Download original file</td></tr>
            <tr><td>&lsaquo; &rsaquo; Arrows</td><td>Navigate between photos</td></tr>
            <tr><td>Tags</td><td>Add/remove tags in the info panel</td></tr>
          </tbody>
        </table>
      </div>

      <div class="help-section">
        <h3>Multi-Select Actions</h3>
        <p>Ctrl+click or Shift+click photos to select. A toolbar appears with:</p>
        <ul>
          <li>Favorite / Unfavorite selected photos</li>
          <li>Export as zip download</li>
          <li>Set date for selected photos</li>
          <li>Add to album</li>
          <li>Remove from album (when inside an album)</li>
        </ul>
      </div>

      <div class="help-section">
        <h3>TV Mode</h3>
        <p>Navigate to <code>/tv</code> on any device on the local network for a fullscreen slideshow.</p>
        <ul>
          <li>Filter by album: <code>/tv?album=ID</code></li>
          <li>Controls appear on mouse move / tap (auto-hide after 3s)</li>
          <li>DLNA: TVs auto-discover "Photo Manager" as a media server</li>
        </ul>
      </div>

      <div class="help-section">
        <h3>CLI Commands</h3>
        <table class="feature-table">
          <tbody>
            <tr><td><code>npx tsx src/cli/index.ts scan [path]</code></td><td>Index photos from directory</td></tr>
            <tr><td><code>npx tsx src/cli/index.ts stats</code></td><td>Show collection statistics</td></tr>
            <tr><td><code>npx tsx src/cli/index.ts migrate</code></td><td>Run database migrations</td></tr>
            <tr><td><code>npx tsx src/cli/index.ts ingest</code></td><td>Process inbox directory</td></tr>
            <tr><td><code>npx tsx src/cli/index.ts import-takeout &lt;path&gt;</code></td><td>Import Google Takeout export</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .help-container {
      height: 100vh;
      overflow-y: auto;
      padding: 24px;
      max-width: 750px;

      h2 { margin: 0 0 20px; color: #ddd; font-size: 1.2rem; }
    }

    .help-section {
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 16px;

      h3 { margin: 0 0 10px; color: #ccc; font-size: 0.95rem; }
      p { font-size: 0.85rem; color: #888; margin: 0 0 10px; line-height: 1.4; }
      ul { margin: 8px 0; padding-left: 20px; font-size: 0.85rem; color: #aaa; li { margin: 4px 0; } }
    }

    .hint {
      background: #1a2a3a;
      border: 1px solid #2a4a6a;
      border-radius: 6px;
      padding: 8px 12px;
      color: #8ac !important;
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

    code {
      background: #2a2a2a;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.8rem;
      color: #ccc;
    }

    .shortcut-table, .feature-table {
      width: 100%;
      border-collapse: collapse;

      th {
        text-align: left;
        padding: 10px 0 4px;
        color: #888;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid #333;
      }

      td {
        padding: 6px 8px;
        font-size: 0.85rem;
        color: #aaa;
        border-bottom: 1px solid #2a2a2a;

        &:first-child { white-space: nowrap; color: #ccc; }
      }
    }
  `],
})
export class HelpComponent {}
