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
            <tr><td>&#8635; Rotate</td><td>Rotate thumbnail 90° clockwise</td></tr>
            <tr><td>&#128269; Similar</td><td>Find photos from same day, same person, or visually similar</td></tr>
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
          <li>Hide / Unhide photos</li>
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
        <h3>Network &amp; Firewall</h3>
        <p>The following ports must be open on the host for full functionality:</p>
        <table class="feature-table">
          <tbody>
            <tr><th colspan="3">Required Ports</th></tr>
            <tr><td><strong>{{ webPort }}/tcp</strong></td><td>Web UI &amp; API</td><td>Main application. Required for all access.</td></tr>
            <tr><td><strong>8200/tcp</strong></td><td>DLNA content server</td><td>Serves photos to smart TVs. Only needed if DLNA is enabled.</td></tr>
            <tr><td><strong>1900/udp</strong></td><td>SSDP discovery</td><td>Allows TVs to auto-discover the DLNA server. Only needed if DLNA is enabled.</td></tr>
          </tbody>
        </table>
        <p style="margin-top: 12px"><strong>Firewall commands (Ubuntu/Debian with ufw):</strong></p>
        <div class="code-block">
          <code>sudo ufw allow {{ webPort }}/tcp    # Web UI</code><br>
          <code>sudo ufw allow 8200/tcp   # DLNA content</code><br>
          <code>sudo ufw allow 1900/udp   # SSDP discovery</code>
        </div>
        <p style="margin-top: 12px"><strong>Firewall commands (RHEL/Fedora with firewalld):</strong></p>
        <div class="code-block">
          <code>sudo firewall-cmd --add-port={{ webPort }}/tcp --permanent</code><br>
          <code>sudo firewall-cmd --add-port=8200/tcp --permanent</code><br>
          <code>sudo firewall-cmd --add-port=1900/udp --permanent</code><br>
          <code>sudo firewall-cmd --reload</code>
        </div>
        <p style="margin-top: 12px">
          Run <code>./scripts/check-env.sh</code> on the host to automatically check port availability and firewall rules.
        </p>
        <p>
          By default, the server only accepts connections from private IPs (10.x, 192.168.x, 172.16-31.x).
          Set <code>PM_ALLOW_REMOTE=true</code> to allow access via Tailscale or other VPNs.
        </p>
      </div>

      <div class="help-section">
        <h3>Production Deployment</h3>
        <p>The app runs as a Docker container via docker-compose:</p>
        <div class="code-block">
          <code># Start the app (runs in background, auto-restarts)</code><br>
          <code>docker compose up -d</code><br><br>
          <code># View logs</code><br>
          <code>docker compose logs -f</code><br><br>
          <code># Stop the app</code><br>
          <code>docker compose down</code><br><br>
          <code># Rebuild after code changes</code><br>
          <code>docker compose up -d --build</code>
        </div>
        <p style="margin-top: 12px"><strong>Port mapping (docker-compose.yml):</strong></p>
        <table class="feature-table">
          <tbody>
            <tr><td>Host <strong>:80</strong> &rarr; Container :3000</td><td>Web UI &amp; API</td></tr>
            <tr><td>Host <strong>:8200</strong> &rarr; Container :8200</td><td>DLNA content server</td></tr>
            <tr><td>Host <strong>:1900/udp</strong> &rarr; Container :1900/udp</td><td>SSDP discovery</td></tr>
          </tbody>
        </table>
        <p style="margin-top: 12px"><strong>Volumes:</strong></p>
        <table class="feature-table">
          <tbody>
            <tr><td><code>/photos</code> (read-only)</td><td>NAS mount — your photo collection</td></tr>
            <tr><td><code>/data</code> (read-write)</td><td>SQLite database, thumbnails, face models, inbox</td></tr>
          </tbody>
        </table>
        <p style="margin-top: 12px">
          The container auto-restarts on failure or reboot (<code>restart: unless-stopped</code>).
          Daily re-index runs at 2 AM inside the container.
        </p>
        <p>
          Before first start, run <code>./scripts/check-env.sh</code> to verify the NAS is mounted,
          ports are free, and firewall rules are set.
        </p>
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

    .code-block {
      background: #111;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 10px 14px;
      font-family: monospace;
      font-size: 0.8rem;
      line-height: 1.6;
      color: #aaa;
      overflow-x: auto;
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
export class HelpComponent {
  webPort = '80';
}
