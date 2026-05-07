# Photo Manager

Self-hosted photo management system for a personal family photo collection (~123k items, 672GB) stored on a NAS.

## Architecture

- **Backend:** Fastify API + better-sqlite3 (SQLite with WAL mode)
- **Frontend:** Angular SPA (planned, not yet scaffolded)
- **CLI:** Commander-based (`npx tsx src/cli/index.ts`)
- **Deployment:** Docker container with two volumes:
  - `/photos` — NAS mount (read-only)
  - `/data` — SQLite DB + thumbnail cache (read-write)
- **Single package**, not a monorepo

## Tech stack

- TypeScript strict mode, ESM (`"type": "module"`)
- Node.js 22+
- `better-sqlite3` — synchronous API, WAL mode, batch transactions
- `sharp` — image processing, HEIC support, thumbnails
- `fluent-ffmpeg` — video thumbnails and probing
- `exif-reader` — EXIF metadata extraction
- `pino` — structured logging

## Project structure

```
src/
├── cli/              # Commander CLI entry point + commands
├── server/           # Fastify API server
├── scanner/          # File discovery, EXIF extraction, thumbnail generation
├── db/               # SQLite connection, migrations, repositories
├── ingestion/        # Dropbox/inbox file intake (planned)
└── shared/           # Types, config, constants, logger
```

## Conventions

- All imports use explicit `.js` extensions (Node16 module resolution)
- Config via env vars prefixed `PM_` (see `src/shared/config.ts`)
- Database repositories use the class pattern with prepared statements
- Scanner is incremental — compares file mtime to skip unchanged files
- File hashes are the filenames (NAS naming convention), not recomputed
- Errors in file processing are logged and skipped, never abort the scan

## CLI commands

```bash
npx tsx src/cli/index.ts scan [path]    # Index photos from a directory
npx tsx src/cli/index.ts stats          # Show database statistics
npx tsx src/cli/index.ts migrate        # Run pending migrations
```

## NAS details

- Photos mounted read-only at a configurable path (PM_MEDIA_ROOT)
- Files named by content hash in semantic folder structures
- Contains images (JPEG, PNG, HEIC), videos (MP4, MOV, etc.), and zip archives

## Feature roadmap

1. ~~Scanner/indexer~~ (done)
2. API endpoints + Angular timeline view
3. Albums (manual curation)
4. GPS map view (Leaflet/OpenStreetMap)
5. Face detection + person recognition (face-api.js)
   - People nav view: horizontal scrollable face circles, click to filter
   - Person exclusion (hidden flag): hide a person's face cluster from timeline/search/people view
     but keep all files on disk. Photos with ONLY hidden people are filtered; mixed photos still show.
   - Accessible via Folders view or "show hidden" toggle
   - Three person states: **named** (visible everywhere), **hidden** (ex-wife — filtered from
     timeline/people but files kept forever), **ignored** (strangers/background — photos still show
     in timeline, but face circle hidden from People view to declutter the UI)
   - Triage workflow: clusters sorted by frequency, "needs review" queue, easy name/ignore/skip per cluster
   - "Manage ignored" toggle in People view to review/reinstate ignored faces
   - Schema: `people (id, name, status ['named','hidden','ignored'])`,
     `faces (id, photo_id, person_id, embedding, x, y, w, h)`
6. Dropbox ingestion path (cron-scanned inbox)
7. Docker image (linux/arm64 for Raspberry Pi)
8. PWA mobile app + device pairing
9. Phone auto-upload via Background Sync API

## Target deployment: Raspberry Pi

The end-goal is a Raspberry Pi (5, 8GB recommended) running as a home server,
replacing Google Photos entirely.

```
┌─ Home Network ──────────────────────────────┐
│                                             │
│  ┌─────────────┐      ┌──────────────────┐  │
│  │ Raspberry Pi │──────│  NAS (SMB/NFS)   │  │
│  │ Docker       │      │  /photos         │  │
│  │ photo-manager│      └──────────────────┘  │
│  │ :3000        │                            │
│  └──────┬──────┘                            │
│         │                                    │
└─────────┼────────────────────────────────────┘
          │
    ┌─────┴──────┐
    │  Tailscale  │  ← mesh VPN, no port forwarding
    └─────┬──────┘
          │
   ┌──────┴───────┐
   │  Phone (PWA) │
   │  Laptop      │
   └──────────────┘
```

### Pi-specific considerations

- ARM64 Docker images — build for `linux/arm64`
- SQLite is ideal — no PostgreSQL overhead
- Thumbnail cache on USB SSD — avoid SD card write wear
- Scanning cron at low concurrency (2-4) to avoid overwhelming the Pi
- sharp and face-api.js are memory-hungry — 8GB Pi recommended

### Remote access: Tailscale

Use Tailscale (free, personal) for remote access instead of exposing ports.
Pi gets a stable `100.x.x.x` address, phone connects over mesh VPN.
No traffic touches the public internet — the whole point is divorcing from cloud surveillance.

### Mobile app: PWA (Progressive Web App)

Angular PWA — no native app, no App Store:

- Installable to home screen, looks and feels like a native app
- Background Sync API for auto-uploading photos over WiFi
- Offline browsing via cached thumbnails
- Push notifications (scan complete, new faces detected)
- Camera access for direct upload

### Authentication: Device pairing

No username/password. Instead, API key via one-time pairing code:

1. Run `photo-manager pair` on the Pi — displays a 6-digit code
2. Enter code in the PWA on your phone
3. Server issues a long-lived API key tied to that device
4. Key stored in browser secure storage, sent as `Authorization` header
5. Revoke devices via CLI (`photo-manager devices revoke <name>`) or web UI

```sql
-- Future migration
devices (id, name, api_key_hash, paired_at, last_seen, is_active)
```

### Phone auto-upload

The PWA uploads new photos to `/api/ingest`, which:

1. Hashes the file for deduplication
2. Moves it into the NAS hash-based folder structure
3. Triggers incremental scan
4. This is the same dropbox/ingestion path — the phone is just another source
