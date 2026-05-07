# Photo Manager

Self-hosted photo management system for ~120k family photos/videos (672GB) on a NAS. Replaces Google Photos with full local control — no cloud, no surveillance.

**Repository:** https://github.com/rburckner/photo-manager

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Container (port 80 → 3000)              │
│                                                 │
│  ┌───────────┐   ┌──────────────────────────┐   │
│  │  Angular   │   │  Fastify API             │   │
│  │  SPA       │◄──│  /api/photos, /api/albums│   │
│  │  (static)  │   │  /api/people, /api/tags  │   │
│  └───────────┘   └──────────┬───────────────┘   │
│                             │                   │
│  ┌──────────────────────────▼───────────────┐   │
│  │  SQLite (WAL) + Thumbnail Cache          │   │
│  │  Face models (face-api.js)               │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌────────────────┐  │
│  │  DLNA   │  │  Cron   │  │  Inbox Watcher │  │
│  │  :8200  │  │  2 AM   │  │  fs.watch      │  │
│  └─────────┘  └─────────┘  └────────────────┘  │
├─────────────────────────────────────────────────┤
│  Volumes:                                       │
│  /photos (NAS, read-only)                       │
│  /data   (DB + thumbnails + face models, r/w)   │
└─────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime:** Node.js 22+, TypeScript strict mode, ESM
- **Backend:** Fastify 5, better-sqlite3 (WAL mode)
- **Frontend:** Angular 21, standalone components, lazy-loaded routes
- **Images:** sharp (HEIC via JPG fallback), exif-reader
- **Video:** fluent-ffmpeg (thumbnails + probe)
- **Face detection:** face-api.js, TensorFlow.js, DBSCAN clustering
- **Maps:** Leaflet + OpenStreetMap + marker clustering
- **TV:** DLNA/UPnP via node-ssdp, fullscreen slideshow mode
- **PWA:** Angular service worker, offline thumbnail cache
- **CLI:** Commander
- **Logging:** Pino

## Project Structure

```
src/
├── cli/                 # CLI entry point + commands (scan, stats, ingest, import-takeout)
├── server/
│   ├── index.ts         # Fastify server, CORS, local network guard
│   ├── cron.ts          # Daily re-index + face scan + thumbnail backfill
│   ├── dlna.ts          # DLNA/UPnP media server (start/stop)
│   └── routes/
│       ├── photos.ts    # Photos CRUD, timeline, search, map, slideshow, export, settings
│       ├── albums.ts    # Albums CRUD, photo management, reorder
│       ├── faces.ts     # People, face scan/cluster, face crop
│       ├── tags.ts      # Tags CRUD, photo tagging
│       └── shares.ts    # Expiring share links
├── scanner/
│   ├── walker.ts        # Async generator filesystem walk
│   ├── exif.ts          # EXIF extraction (sharp + exif-reader)
│   ├── media-info.ts    # MIME detection, video probe
│   ├── thumbnails.ts    # Thumbnail gen (sharp + ffmpeg, HEIC fallback)
│   ├── faces.ts         # Face detection, embeddings, DBSCAN clustering
│   └── index.ts         # Scan orchestrator (incremental, resumable, batched)
├── db/
│   ├── connection.ts    # SQLite singleton, WAL mode, pragmas
│   ├── migrate.ts       # Migration runner
│   ├── migrations/      # 001_initial, 002_cleanup_log, 003_faces, 004_shares, 005_settings
│   └── repositories/    # photo, album, face, tag, scan-progress
├── ingestion/           # Inbox watcher, hash, deduplicate, move to NAS
└── shared/              # Types, config, constants, logger

web/                     # Angular 21 SPA
├── src/app/
│   ├── components/
│   │   ├── timeline/    # Date-grouped photo grid, year pills, infinite scroll
│   │   ├── folders/     # NAS folder tree with photo grid
│   │   ├── albums/      # Album list, detail, create/edit/delete
│   │   ├── people/      # Face circles, triage (name/ignore/hide), photo grid
│   │   ├── map/         # Leaflet map with clustered markers, date filter
│   │   ├── search/      # Full-text search across filename, folder, camera
│   │   ├── tags/        # Tag management, browse by tag
│   │   ├── favorites/   # Starred photos
│   │   ├── stats/       # Charts: by year, camera, file type, scan progress
│   │   ├── settings/    # TV services, face scan, thumbnails, nav toggles, cleanup
│   │   ├── duplicates/  # Duplicate detection, keep/remove
│   │   ├── fix-dates/   # Drag-and-drop date correction
│   │   ├── tv/          # Fullscreen slideshow (no shell, remote-friendly)
│   │   ├── lightbox/    # Shared: EXIF info, nav, favorite, download, album, tags
│   │   ├── selection-bar/ # Multi-select toolbar (favorite, album, export, set date)
│   │   ├── shell/       # Sidebar nav, settings-driven visibility
│   │   ├── shortcuts/   # Press ? for keyboard shortcuts overlay
│   │   ├── toast/       # Toast notification component
│   │   ├── help/        # Help page with shortcuts, features, firewall, deployment
│   │   └── people/      # People/face detection view
│   ├── services/        # ApiService, SelectionService, SettingsService, ToastService
│   └── models/          # TypeScript interfaces
```

## Conventions

- All imports use explicit `.js` extensions (Node16 module resolution)
- Config via env vars prefixed `PM_` (see `.env.example`)
- Database repositories use the class pattern with prepared statements
- Scanner is incremental — compares file mtime to skip unchanged files
- File hashes are the filenames (NAS naming convention), not recomputed
- Errors in file processing are logged and skipped, never abort the scan
- NAS is always read-only — delete only removes from DB index, never touches files
- Cleanup log tracks files removed from index for manual NAS deletion

## CLI Commands

```bash
npx tsx src/cli/index.ts scan [path]              # Index photos (incremental)
npx tsx src/cli/index.ts stats                    # Collection statistics
npx tsx src/cli/index.ts migrate                  # Run pending DB migrations
npx tsx src/cli/index.ts ingest                   # Process inbox directory
npx tsx src/cli/index.ts import-takeout <path>    # Import Google Takeout export
```

## Production Deployment

```bash
docker compose up -d          # Start (auto-restarts)
docker compose logs -f        # View logs
docker compose down           # Stop
docker compose up -d --build  # Rebuild after changes
./scripts/check-env.sh        # Pre-flight check (ports, NAS, firewall)
```

**Ports:** Host :80 → Container :3000 (web), :8200 (DLNA), :1900/udp (SSDP)

## Security

- Local network guard: rejects non-private IPs by default
- `PM_ALLOW_REMOTE=true` to allow Tailscale/VPN access
- DLNA is inherently local (multicast doesn't leave LAN)
- Share links are token-based with configurable expiry

## Face Detection

- face-api.js with TensorFlow.js (pure JS, no native bindings required)
- SSD MobileNet for detection, 128-dim embeddings for recognition
- DBSCAN clustering groups similar faces into people
- Three person states:
  - **named** — visible everywhere
  - **hidden** — filtered from timeline/people, files kept forever (e.g., ex-wife)
  - **ignored** — removed from People view, photos still show in timeline (strangers)
- "Manage ignored" toggle to review/reinstate
- Status buttons toggle (click again to revert to unreviewed)
- Face scan cancellable from Settings UI
- Auto-runs after daily cron re-index (50 photo batch)

## TV Integration

- **Slideshow:** `/tv` route — fullscreen, auto-advance, arrow keys, album filter
- **DLNA:** Auto-discovered by smart TVs as "Photo Manager"
- **Default TV album:** auto-created on server start, filter slideshow with `?album=ID`
- Start/stop DLNA from Settings page

## Target Deployment: Raspberry Pi

- Pi 5 (8GB recommended) — sharp and face-api.js are memory-hungry
- ARM64 Docker images (`linux/arm64`)
- SQLite — no PostgreSQL overhead
- Thumbnail cache on USB SSD to avoid SD card wear
- Tailscale for remote access (no port forwarding)
- PWA installable to phone home screen

## Future / Not Yet Implemented

- Phone auto-upload via Background Sync API
- Device pairing authentication (one-time code → API key)
- Perceptual hashing for near-duplicate detection
- Offline map tile cache
- Face detection in worker thread (avoid blocking API)
