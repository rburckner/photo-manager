# Photo Manager

A self-hosted family photo management system. Replaces Google Photos with full local control — no cloud, no surveillance.

Built for a collection of ~120k photos/videos (672GB) on a NAS, served via Docker on a Raspberry Pi (or any Linux host).

## Features

- **Timeline** — Browse photos by date with year filters and sort options
- **Albums** — Create, manage, and share photo albums
- **People** — Face detection and recognition with triage (name/ignore/hide)
- **Map** — GPS-tagged photos on OpenStreetMap with offline tile caching
- **Search** — Query by filename, folder, camera model
- **Tags** — Custom tags with bulk tagging from lightbox
- **Favorites** — Star photos for quick access
- **TV Mode** — Fullscreen slideshow at `/tv` for smart TVs
- **DLNA** — Auto-discovered media server for TVs on the network
- **Visual Similarity** — MobileNet embeddings find photos that look alike
- **Face Detection** — face-api.js with DBSCAN clustering
- **Multi-select** — Ctrl+click, Shift+range in every view
- **Bulk Actions** — Favorite, hide, export zip, set date, add to album
- **Hidden Photos** — Keep files on disk but hide from all views
- **Fix Dates** — Drag-and-drop photos onto month/year grid
- **Duplicate Detection** — Find files with same hash
- **Photo Rotate** — Rotate thumbnails from the lightbox
- **Video Hover Preview** — Mouseenter plays muted preview
- **Google Takeout Import** — CLI command to import exports
- **Photo Ingestion** — Drop box directory with auto-import
- **Sharing** — Expiring share links for photos and albums
- **Device Pairing** — API key auth via one-time pairing codes
- **PWA** — Installable, offline thumbnail cache
- **Dark Theme** — Fully dark UI, mobile responsive
- **Keyboard Shortcuts** — Press `?` for overlay

## Quick Start

### Development

```bash
# Install dependencies
npm install
cd web && npm install && cd ..

# Configure
cp .env.example .env
# Edit .env — set PM_MEDIA_ROOT to your photo directory

# Run database migrations
npx tsx src/cli/index.ts migrate

# Scan your photos
npx tsx src/cli/index.ts scan /path/to/photos

# Start the API server
npx tsx src/server/index.ts

# Start the Angular dev server (separate terminal)
cd web && npx ng serve
```

Open http://localhost:4200

### Docker (Production)

```bash
# Check environment
./scripts/check-env.sh

# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

Open http://your-host — TV slideshow at http://your-host/tv

### CLI Commands

```bash
npx tsx src/cli/index.ts scan [path]           # Index photos
npx tsx src/cli/index.ts stats                 # Collection statistics
npx tsx src/cli/index.ts migrate               # Run DB migrations
npx tsx src/cli/index.ts ingest                # Process inbox directory
npx tsx src/cli/index.ts import-takeout <path> # Import Google Takeout
npx tsx src/cli/index.ts pair                  # Generate device pairing code
```

## Architecture

```
Docker Container (port 80)
├── Fastify API (:3000)          — REST API, serves Angular SPA
├── Angular 21 SPA               — Dark theme, lazy-loaded routes
├── SQLite (WAL mode)            — All metadata, albums, faces, settings
├── DLNA Server (:8200)          — UPnP media server for TVs
├── Cron (2 AM daily)            — Re-index, thumbnails, faces, embeddings
├── Inbox Watcher                — Auto-import from drop directory
└── Volumes:
    ├── /photos (read-write)      — NAS mount
    └── /data (read-write)       — DB, thumbnails, face models
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, TypeScript strict |
| Backend | Fastify 5, better-sqlite3 |
| Frontend | Angular 21, standalone components |
| Images | sharp (HEIC via fallback), exif-reader |
| Video | ffmpeg (thumbnails + probe) |
| Faces | face-api.js, TensorFlow.js |
| Similarity | MobileNet v2 embeddings |
| Maps | Leaflet + OpenStreetMap |
| TV | DLNA/UPnP (node-ssdp) |
| PWA | Angular service worker |

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|---|---|---|
| `PM_MEDIA_ROOT` | `/photos` | Photo source directory |
| `PM_DB_PATH` | `./data/photos.db` | SQLite database path |
| `PM_THUMBNAIL_DIR` | `./data/thumbnails` | Thumbnail output |
| `PM_DROPBOX_DIR` | `./data/inbox` | Ingestion inbox |
| `PM_PORT` | `3000` | API server port |
| `PM_SCAN_CONCURRENCY` | `4` | Parallel file operations |
| `PM_CRON_HOUR` | `2` | Daily re-index hour (0-23) |
| `PM_LOG_LEVEL` | `info` | Logging level |
| `PM_ALLOW_REMOTE` | `false` | Allow non-private IPs |

## Ports

| Port | Protocol | Service |
|---|---|---|
| 80 | TCP | Web UI + API |
| 8200 | TCP | DLNA content server |
| 1900 | UDP | SSDP discovery |

## Security

- Local network guard: rejects non-private IPs by default
- `PM_ALLOW_REMOTE=true` for Tailscale/VPN access
- Device pairing: `photo-manager pair` generates 6-digit codes
- Share links: token-based with configurable expiry
- NAS mounted read-write for ingestion — existing files are never modified or deleted, only new files are added via the inbox

## Raspberry Pi Deployment

- Pi 5 (8GB) recommended
- Build ARM64 Docker image: `docker build --platform linux/arm64 -t photo-manager .`
- Mount NAS via NFS/SMB
- Use Tailscale for remote access
- Thumbnail cache on USB SSD (avoid SD card wear)

## License

Private — not open source.
