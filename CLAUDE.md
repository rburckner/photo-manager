# Photo Manager

Self-hosted photo management system for ~120k family photos/videos (672GB) on a NAS. Replaces Google Photos with full local control — no cloud, no surveillance.

**Repository:** https://github.com/rburckner/photo-manager

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Docker Container (port 80 → 3000)                      │
│                                                         │
│  ┌───────────┐   ┌──────────────────────────────────┐   │
│  │  Angular   │   │  Fastify API                     │   │
│  │  21 SPA    │◄──│  /api/{photos,albums,people,     │   │
│  │  + PWA     │   │   tags,trash,upload,auth,...}    │   │
│  └───────────┘   └──────────┬───────────────────────┘   │
│                             │                           │
│  ┌──────────────────────────▼─────────────────────────┐ │
│  │  SQLite (WAL) + Thumbnail Cache + Face models      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─────────┐  ┌─────────────┐  ┌────────────────┐      │
│  │  DLNA   │  │  Cron 2 AM  │  │  Inbox Watcher │      │
│  │  :8200  │  │  re-index,  │  │  fs.watch +    │      │
│  │         │  │  faces (WT),│  │  60s poll;     │      │
│  │         │  │  pHash, GPS,│  │  inline index  │      │
│  │         │  │  thumbs,    │  │                │      │
│  │         │  │  trash purge│  │                │      │
│  └─────────┘  └─────────────┘  └────────────────┘      │
│                                                         │
│  Worker thread (face-api.js) — keeps API responsive     │
│  during CPU-heavy face detection batches                │
├─────────────────────────────────────────────────────────┤
│  Volumes:                                               │
│  /photos (NAS, read-write for ingestion)                │
│  /data   (DB + thumbnails + face models, r/w)           │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime:** Node.js 22+, TypeScript strict mode, ESM
- **Backend:** Fastify 5, better-sqlite3 (WAL mode)
- **Frontend:** Angular 21, signal-based state, standalone components, lazy-loaded routes
- **Images:** sharp (HEIC via JPG fallback), exif-reader
- **Video:** fluent-ffmpeg (thumbnails + probe)
- **Face detection:** face-api.js + TensorFlow.js, runs in a Node worker thread, DBSCAN clustering
- **Perceptual hashing:** dHash (sharp resize 9x8 grayscale → 64-bit fingerprint), chunk-bucketing for near-duplicate clusters
- **Visual similarity:** MobileNet v2 embeddings
- **Maps:** Leaflet + OpenStreetMap + marker clustering, offline tile cache
- **TV:** DLNA/UPnP via node-ssdp, fullscreen slideshow mode
- **PWA:** Angular service worker for shell + a custom service worker (`upload-sync-sw.js`, scope `/upload-sync/`) for Background Sync uploads
- **Tests:** Vitest (backend); 44+ tests for trash, ingestion, cron auto-purge, perceptual hash
- **CLI:** Commander
- **Logging:** Pino

## Project Structure

```
src/
├── cli/                     # CLI entry + commands
│   ├── index.ts             # `scan`, `stats`, `migrate`, `ingest`, `import-takeout`, `pair`
│   └── commands/            # one file per command
├── server/
│   ├── index.ts             # Fastify server, CORS, local network guard
│   ├── network-guard.ts     # isPrivateIp + requireLocalNetwork preHandler
│   ├── cron.ts              # Daily 2 AM: trash auto-purge → re-index → thumbnails
│   │                        #   → pHash backfill (500/run) → face scan worker (50/run)
│   │                        #   → embeddings (100/run)
│   ├── dlna.ts              # DLNA/UPnP server
│   └── routes/
│       ├── photos.ts        # Photos CRUD, timeline, search, map, slideshow,
│       │                    # export, settings, scan/cancel endpoints,
│       │                    # /duplicates (exact + perceptual)
│       ├── trash.ts         # Trash/restore/purge — local-network-only preHandler
│       ├── upload.ts        # POST /api/upload + /upload/check (Bearer device auth)
│       ├── albums.ts        # Albums CRUD, photo management, reorder
│       ├── faces.ts         # People, face scan worker, face crop
│       ├── tags.ts          # Tags CRUD, photo tagging
│       ├── shares.ts        # Expiring share links
│       ├── auth.ts          # Pairing codes, device list/revoke, activity log,
│       │                    # createAuthMiddleware (gates all /api when
│       │                    # auth_required=true)
│       └── notifications.ts # In-app notifications
├── scanner/
│   ├── walker.ts            # Async generator filesystem walk (skips dot-dirs,
│   │                        # so .trash and .git auto-excluded)
│   ├── exif.ts              # EXIF extraction
│   ├── media-info.ts        # MIME detection, video probe
│   ├── thumbnails.ts        # Thumbnail gen (HEIC fallback)
│   ├── perceptual-hash.ts   # dHash + Hamming distance + chunk splitting
│   ├── find-near-duplicates.ts # Chunk-bucket + union-find clustering
│   ├── faces.ts             # Worker spawning + clustering only (in-process
│   │                        # path was removed; cron uses runFaceScanWorker)
│   ├── face-worker.ts       # Node worker thread that runs face-api.js
│   ├── embeddings.ts        # MobileNet visual-similarity embeddings
│   └── index.ts             # Scan orchestrator (incremental, resumable, batched)
├── db/
│   ├── connection.ts
│   ├── migrate.ts
│   ├── migrations/          # 001_initial → 011_perceptual_hash
│   └── repositories/        # photo, album, face, tag, scan-progress
├── ingestion/
│   ├── index.ts             # Inbox watcher + processInbox + ingestBuffer
│   │                        # (per-file helper reused by /api/upload)
│   └── *.test.ts            # Vitest coverage
├── shared/                  # Types, config, constants, logger
└── test-helpers.ts          # In-memory DB factory for vitest

web/                          # Angular 21 SPA
├── public/
│   ├── upload-sync-sw.js    # Custom SW for Background Sync uploads
│   ├── manifest.webmanifest
│   ├── icons/, leaflet/
├── src/app/
│   ├── components/
│   │   ├── timeline/        # Date-grouped grid, year pills, infinite scroll
│   │   ├── folders/         # NAS folder tree
│   │   ├── albums/          # Album CRUD + detail
│   │   ├── people/          # Face circles, triage
│   │   ├── map/             # Leaflet, clustered markers, offline tiles
│   │   ├── search/          # Full-text search
│   │   ├── tags/            # Tag mgmt + browse
│   │   ├── favorites/       # Starred photos
│   │   ├── trash/           # Trash grid, restore, empty (uses signals)
│   │   ├── duplicates/      # Exact + Near (perceptual) tabs
│   │   ├── stats/           # Collection charts
│   │   ├── settings/        # Cron, DLNA, faces, GPS, embeddings, ingest,
│   │   │                    # devices, trash retention, navigation toggles
│   │   ├── activity/        # Activity log
│   │   ├── notification-bell/ # Sidebar bell + panel
│   │   ├── pair/            # /pair — phone enters 6-digit code, gets API key
│   │   ├── upload/          # /upload — file picker, folder-watch (FSAPI),
│   │   │                    # parallel pool, IndexedDB-backed retry queue
│   │   ├── fix-dates/       # Drag photos onto month/year grid
│   │   ├── tv/              # Fullscreen slideshow (no shell)
│   │   ├── lightbox/        # EXIF, nav, favorite, download, album, tags, trash
│   │   ├── selection-bar/   # Multi-select toolbar
│   │   ├── shell/           # Sidebar nav, paired-device-aware Upload/Pair link
│   │   ├── shortcuts/, toast/, help/, photo-detail/
│   ├── services/
│   │   ├── api.service.ts
│   │   ├── selection.service.ts        # Signal-based; legacy BehaviorSubject
│   │   │                               # mirrors kept for old subscribers
│   │   ├── settings.service.ts
│   │   ├── filter.service.ts
│   │   ├── tile-cache.service.ts
│   │   ├── toast.service.ts            # supports `withAction(...)` for undo toasts
│   │   ├── device-auth.service.ts      # Phone API key (localStorage + IDB mirror)
│   │   ├── folder-watch.service.ts     # FileSystemDirectoryHandle persistence
│   │   └── upload-queue.service.ts     # IndexedDB queue + Background Sync registration
│   └── models/
└── README.md
```

## Conventions

- All imports use explicit `.js` extensions (Node16 module resolution)
- Config via env vars prefixed `PM_` (see `.env.example`)
- Database repositories use the class pattern with prepared statements
- Scanner is incremental — compares file mtime to skip unchanged files
- File hashes are the filenames (NAS naming convention), not recomputed
- Errors in file processing are logged and skipped, never abort the scan
- NAS is read-write for ingestion and trash — but only files in `inbox/` and `.trash/` are touched; existing photo files are never modified
- All "active photo" queries filter `WHERE deleted_at IS NULL`; `findById` and `findByHash` stay neutral so the trash UI and ingestion duplicate-check still see trashed rows
- Photo-grid templates read **selection signals** (`selection.isSelectingSignal()`, `selection.selectedIdsSignal().has(id)`) — the BehaviorSubject path was retained but reading the getter directly in templates triggers `ExpressionChangedAfterItHasBeenCheckedError` in dev mode (commit 97e4275 has the full debug story)
- Trash and ingestion file ops use atomic `rename()` within the same volume — cross-volume copy is intentionally not supported (would defeat trash's "no extra disk during retention" property)
- Bulk action UI uses the **toast `withAction()` pattern** for undo — see `bulkDelete` in `selection-bar.ts` for the canonical example

## CLI Commands

```bash
npx tsx src/cli/index.ts scan [path]              # Index photos (incremental)
npx tsx src/cli/index.ts stats                    # Collection statistics
npx tsx src/cli/index.ts migrate                  # Run pending DB migrations
npx tsx src/cli/index.ts ingest                   # Process inbox directory
npx tsx src/cli/index.ts import-takeout <path>    # Import Google Takeout export
npx tsx src/cli/index.ts pair                     # Generate 6-digit pairing code
```

## Tests

```bash
npm test                # Backend vitest run (44+ tests)
npm run test:watch      # Watch mode
npm run lint            # ESLint (strict-type-checked, 0 errors)
npx tsc --noEmit        # Backend typecheck
cd web && npx tsc --noEmit -p tsconfig.app.json   # Frontend typecheck
```

Test coverage:
- `src/db/repositories/photo.repository.test.ts` — trash methods, active-query filtering
- `src/ingestion/ingestion.test.ts` — inbox processing
- `src/ingestion/ingest-buffer.test.ts` — per-file ingest used by upload route
- `src/server/cron.test.ts` — auto-purge file + thumbnail cleanup, ENOENT tolerance
- `src/scanner/perceptual-hash.test.ts` — Hamming, chunking, transitive clustering

## Production Deployment

```bash
docker compose up -d --build  # Rebuild after code changes (REQUIRED for backend changes)
docker compose logs -f        # View logs
docker compose down           # Stop
./scripts/check-env.sh        # Pre-flight check (ports, NAS, firewall)
```

**Ports:** Host :80 → Container :3000 (web), :8200 (DLNA), :1900/udp (SSDP)

## Security

- Local network guard: rejects non-private IPs by default
- `PM_ALLOW_REMOTE=true` allows Tailscale/VPN access for **read** endpoints
- Trash delete endpoints use a stricter `requireLocalNetwork` preHandler — they reject non-private IPs **regardless of `PM_ALLOW_REMOTE`** (matches the user's "remote browse OK, remote delete no" preference)
- Upload endpoint (`POST /api/upload`) **always** requires Bearer device auth, regardless of `auth_required` setting (uploads are write operations)
- Pairing codes expire after 5 minutes
- DLNA is inherently local (multicast doesn't leave LAN)
- Share links are token-based with configurable expiry

## Trash

- Two-stage delete with **30-day retention** (configurable via Settings UI or `PM_TRASH_RETENTION_DAYS` env)
- Storage: `{mediaRoot}/.trash/{YYYY-MM}/{hash}{ext}` — same volume as live photos so `rename()` is atomic and zero extra disk during retention
- Schema: `photos.deleted_at`, `photos.trash_path`, `photos.original_path` (migration 010)
- Auto-purge runs at the start of each daily cron, `unlink`s expired files + thumbnails, removes DB rows
- Walker auto-skips `.trash` because it's a dot-prefixed directory
- UI: Selection bar Delete + lightbox trash icon use the **undo toast** pattern; `/trash` route shows the soft-deleted grid with per-item Restore + Delete forever, plus Empty/Restore-all toolbar
- Sidebar shows trash count badge, refreshed on bulk action and on every navigation

## Phone Upload

- Device pairing flow: desktop Settings generates a 6-digit code → phone visits `/pair`, enters code + device name, server returns API key → phone stores in `localStorage` + mirrors to IndexedDB for the SW
- `/upload` route on the phone: file picker (multi-select images + videos), parallel pool (3 concurrent), client-side SHA-256 + pre-flight `GET /api/upload/check?hash=` to skip duplicates without uploading bytes
- **Folder watch** (Chromium only): `showDirectoryPicker()` lets the user pick a folder once; the handle persists in IndexedDB. Re-visits auto-scan for new photos via name+size+mtime fingerprint deduplication. iOS Safari and Firefox fall back to manual picking
- **Background Sync** (Chromium only): failed uploads queue in IndexedDB with the actual file blob; a custom service worker (`/upload-sync/` scope) listens for `pm-upload-flush` sync events and POSTs queued items, with a 5-attempt cap. Survives app close
- Other browsers (iOS Safari): IndexedDB queue still persists, but uploads only retry when the user re-opens `/upload`

## Perceptual hashing / Near-duplicates

- 64-bit dHash per image, stored as hex in `photos.perceptual_hash` (migration 011)
- Computed inline during scanning (`processFile`) and backfilled by both:
  - The daily cron (500 photos per run)
  - A manual API trigger: `POST /api/photos/perceptual-hash/scan` with status + cancel companions
- Near-duplicate query: `GET /api/photos/duplicates/perceptual?distance=N` (N = 0..7). Uses **chunk-bucketing** (8 byte-chunks) — pigeonhole guarantees that any two hashes within Hamming ≤ 7 share a chunk exactly, so candidate selection is roughly linear instead of N². Union-find merges related pairs into clusters
- Frontend: Duplicates view has Exact / Near tabs, distance slider (0–7), per-photo trash button using existing undo flow

## Face Detection

- face-api.js with TensorFlow.js (pure JS, no native bindings required)
- SSD MobileNet for detection, 128-dim embeddings for recognition
- DBSCAN clustering groups similar faces into people
- **Runs in a Node worker thread** (`src/scanner/face-worker.ts`) so the API thread stays responsive during the cron's 10–25s detection batches
- Three person states:
  - **named** — visible everywhere
  - **hidden** — filtered from timeline/people, files kept forever (e.g., ex-wife)
  - **ignored** — removed from People view, photos still show in timeline (strangers)
- "Manage ignored" toggle to review/reinstate
- Status buttons toggle (click again to revert to unreviewed)
- Face scan cancellable from Settings UI
- Auto-runs after the daily cron re-index (50-photo batch via `runFaceScanWorker`)

## TV Integration

- **Slideshow:** `/tv` route — fullscreen, auto-advance, arrow keys, album filter
- **DLNA:** Auto-discovered by smart TVs as "Photo Manager"
- **Default TV album:** auto-created on server start, filter slideshow with `?album=ID`
- Start/stop DLNA from Settings page

## Background Processing

The daily cron (default 2 AM, `PM_CRON_HOUR`) runs in this order:

1. **Trash auto-purge** — `unlink` files + thumbs older than retention; remove DB rows
2. **Re-index** — incremental walk, mtime-based skip; new files indexed in batches
3. **Thumbnail backfill** — up to 200 missing thumbnails generated
4. **Perceptual hash backfill** — up to 500 missing dHashes computed
5. **Face scan (worker)** — 50-photo batch; clusters faces if any new found
6. **Visual embeddings** — 100-photo batch (MobileNet v2)

Manual triggers (Settings page, all cancellable):
- "Generate thumbnails" — full sweep of missing thumbs
- "Compute hashes" (Duplicates → Near tab) — full sweep of missing dHashes
- "Scan for faces" — face worker on all unscanned photos
- "Scan for GPS" — re-extract GPS from EXIF for photos missing coords
- "Embed photos" — full sweep of missing visual embeddings

For first-time setup of a 120k-photo library: **manual triggers are far faster** than waiting for the daily-cron drip.

## Target Deployment: Raspberry Pi

- Pi 5 (8GB recommended) — sharp and face-api.js are memory-hungry
- ARM64 Docker images (`linux/arm64`)
- SQLite — no PostgreSQL overhead
- Thumbnail cache on USB SSD to avoid SD card wear
- Tailscale for remote access (no port forwarding)
- PWA installable to phone home screen

## Future / Not Yet Implemented

- Phone library auto-detection on iOS Safari (no FileSystemAccess API)
- Periodic Background Sync (vs. one-shot Background Sync) for periodic phone-library re-scans
- Face detection on uploaded photos in the request path (currently waits for daily cron)
- Trim mode for video uploads (currently uploads whole videos)
- HEIC support on the phone-side hashing path (current: relies on browser File API)
