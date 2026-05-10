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
│  │         │  │  thumb recon│  │                │      │
│  │         │  │  + backfill,│  │                │      │
│  │         │  │  trash purge│  │                │      │
│  └─────────┘  └─────────────┘  └────────────────┘      │
│                                                         │
│  Worker thread (@vladmandic/face-api + tfjs-node C++)   │
│  during CPU-heavy face detection batches                │
├─────────────────────────────────────────────────────────┤
│  Volumes:                                               │
│  /photos (NAS, read-write for ingestion)                │
│  /data   (DB + thumbnails + face models, r/w)           │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime:** Node.js **22 LTS** (use nvm; tfjs-node native bindings lag the latest Node — Node 24 has no working ABI), TypeScript strict mode, ESM
- **Backend:** Fastify 5, better-sqlite3 (WAL mode)
- **Frontend:** Angular 21, signal-based state, standalone components, lazy-loaded routes
- **Images:** sharp (with native libheif for HEIC/HEIF decode), exif-reader. On-demand HEIC→JPEG transcode in the file-serve route handles browsers that don't render HEIC natively (Chrome/Firefox/Edge); Safari gets the original
- **Video:** fluent-ffmpeg (thumbnails + probe)
- **Face detection:** `@vladmandic/face-api` (maintained fork of face-api.js) + `@tensorflow/tfjs-node@4` (libtensorflow C++ backend), runs in a Node worker thread, DBSCAN clustering. The original `face-api.js@0.22` was incompatible with tfjs 4 (`forwardFunc_1` removed in tfjs-core 2+). The C++ backend gives ~70× speedup over the pure-JS fallback (~14 photos/sec vs ~0.2 on AVX512 hardware)
- **Perceptual hashing:** dHash (sharp resize 9x8 grayscale → 64-bit fingerprint), chunk-bucketing for near-duplicate clusters
- **Visual similarity:** MobileNet v2 embeddings
- **Maps:** Leaflet + OpenStreetMap + marker clustering, offline tile cache
- **TV:** DLNA/UPnP via node-ssdp, fullscreen slideshow mode
- **PWA:** Angular service worker for shell + a custom service worker (`upload-sync-sw.js`, scope `/upload-sync/`) for Background Sync uploads
- **Tests:** Vitest (backend); 105 tests covering trash routes/repo, ingestion, cron auto-purge, walker, scanner, thumbnails, perceptual hash, NAS health, hide-person filtering, Takeout import
- **CLI:** Commander
- **Logging:** Pino

## Project Structure

```
src/
├── cli/                     # CLI entry + commands
│   ├── index.ts             # `scan`, `stats`, `migrate`, `ingest`, `import-takeout`,
│   │                        # `pair`, `reset-face-data`, `reconcile-thumbnails`,
│   │                        # `find-redundant-jpgs`, `move-redundant-jpgs`,
│   │                        # `prune-missing`, `purge-staged-jpg-rows`
│   └── commands/            # one file per command
├── server/
│   ├── index.ts             # Fastify server, CORS, local network guard
│   ├── network-guard.ts     # isPrivateIp + requireLocalNetwork preHandler
│   ├── cron.ts              # Daily 2 AM: trash auto-purge → re-index →
│   │                        #   thumbnail reconcile (NULL paths for missing files)
│   │                        #   → thumbnail backfill (200/run)
│   │                        #   → pHash backfill (500/run) → face scan worker (50/run)
│   │                        #   → embeddings (100/run)
│   ├── dlna.ts              # DLNA/UPnP server
│   └── routes/
│       ├── photos.ts        # Photos CRUD, timeline, search, map, slideshow,
│       │                    # export, settings, scan/cancel endpoints,
│       │                    # /duplicates (exact + perceptual),
│       │                    # /screenshots (heuristic memes), /no-people
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
│   ├── thumbnails.ts        # Thumbnail gen (sharp/libheif for HEIC)
│   ├── reconcile-thumbnails.ts # NULL thumbnail_path for photos whose file
│   │                        # is missing on disk; called by CLI + cron
│   ├── heic-fallback.ts     # Shared sharp+heic-decode WASM fallback used
│   │                        # by thumbnails.ts and the file-serve route
│   ├── perceptual-hash.ts   # dHash + Hamming distance + chunk splitting
│   ├── find-near-duplicates.ts # Chunk-bucket + union-find clustering
│   ├── faces.ts             # Worker spawning + clustering only (in-process
│   │                        # path was removed; cron uses runFaceScanWorker)
│   ├── face-worker.ts       # Worker thread; imports tfjs-node BEFORE
│   │                        # @vladmandic/face-api so face-api binds to the
│   │                        # native C++ backend instead of the slow JS fallback
│   ├── embeddings.ts        # MobileNet visual-similarity embeddings
│   └── index.ts             # Scan orchestrator (incremental, resumable, batched)
├── db/
│   ├── connection.ts
│   ├── migrate.ts
│   ├── migrations/          # 001_initial → 014_trash_reason
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
│   │   ├── trash/           # Trash grid; ctrl/shift+click multi-select
│   │   │                    # with bulk Restore via selection bar
│   │   ├── duplicates/      # Exact + Near (perceptual) tabs
│   │   ├── screenshots/     # /screenshots — heuristic-scored meme/screenshot
│   │   │                    # candidates (default-hidden in nav)
│   │   ├── no-people/       # /no-people — face-scanned photos with zero
│   │   │                    # detected faces (default-hidden in nav)
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
- The selection bar reads three context observables from `SelectionService` to swap actions: `currentAlbumId$` (shows "Remove from Album"), `currentPersonId$` (shows "Reassign to..."), and `currentViewIsTrash$` (shows "Restore" + hides Delete/Hide/Set-Date/etc. since they don't apply to trashed photos). Components set these in `ngOnInit`/`ngOnDestroy`

## CLI Commands

```bash
npx tsx src/cli/index.ts scan [path]              # Index photos (incremental)
npx tsx src/cli/index.ts stats                    # Collection statistics
npx tsx src/cli/index.ts migrate                  # Run pending DB migrations
npx tsx src/cli/index.ts ingest                   # Process inbox directory
npx tsx src/cli/index.ts import-takeout <path>    # Import Google Takeout export
npx tsx src/cli/index.ts pair                     # Generate 6-digit pairing code
npx tsx src/cli/index.ts reconcile-thumbnails     # NULL thumbnail_path where file is missing on disk
                                                  #   (--dry-run for a count without changes)
npx tsx src/cli/index.ts reset-face-data --yes    # Wipe faces, people, face_scan_status
npx tsx src/cli/index.ts find-redundant-jpgs      # Find JPG/HEIC pairs with same hash
npx tsx src/cli/index.ts move-redundant-jpgs      # Atomic-rename redundant JPGs to .staged-jpgs/
npx tsx src/cli/index.ts prune-missing            # Drop DB rows whose files are gone
npx tsx src/cli/index.ts purge-staged-jpg-rows    # Drop DB rows under .staged-jpgs/ after manual rm
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

## Dev Deployment (in Docker)

API runs in a container with the project source bind-mounted; tsx watch picks up
edits live. Angular ng serve stays on the host (port 4200) and proxies `/api`
+ `/health` to the container via `web/src/proxy.conf.json`.

```bash
docker compose -f docker-compose.dev.yml up -d --build
cd web && npm start                                      # ng serve on :4200
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml exec api bash   # shell into container
docker compose -f docker-compose.dev.yml down
```

The dev compose bind-mounts `./` to `/app` with an anonymous volume for
`/app/node_modules` (so the image's linux-built native modules aren't shadowed
by a host-built `./node_modules`). The NAS path is hardcoded to
`/mnt/robert/photos`; update the volume mapping if your fstab mount lives
elsewhere.

**Saving any backend file restarts the API** via tsx watch — kills any
in-progress face/thumbnail/embedding scan. Frontend edits are independent
because ng serve runs on the host.

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
- Schema: `photos.deleted_at`, `photos.trash_path`, `photos.original_path` (migration 010); `photos.trash_reason` enum 'user' | 'jpg-redundant' (migration 014) lets the redundant-JPG cleanup workflow trash without retention
- Auto-purge runs at the start of each daily cron, `unlink`s expired files + thumbnails, removes DB rows
- Walker auto-skips `.trash` because it's a dot-prefixed directory
- UI: Selection bar Delete + lightbox trash icon use the **undo toast** pattern; `/trash` route shows the soft-deleted grid with per-item Restore + Delete forever, plus Empty/Restore-all toolbar. **Bulk Restore** via ctrl/shift+click multi-select on `/trash` calls `POST /api/photos/restore` and triggers a grid refresh
- Sidebar shows trash count badge, refreshed on bulk action and on every navigation

## Triage views (default-hidden)

Two views are wired into the sidebar but hidden by default. Operators opt in from
**Settings → Navigation**: `show_screenshots_nav` and `show_no_people_nav`. Both
pages keep an empty grid until the user clicks **Scan** — explicit gating so the
heavy DB query doesn't fire on every navigation.

- **`/screenshots` — Memes & Screenshots.** Heuristic-scored candidates summed
  from: no EXIF camera (+2), no GPS (+1), `file_size < 500 KB` (+1), square or
  4:3 aspect ratio (+2/+1), and known phone-screenshot resolutions like
  1284×2778, 1080×2400, 828×1792 (+3). Adjustable `min_score` slider (default
  5). Multi-select with shift+click range; selection bar's standard Delete
  trashes them. The score itself is exposed via the `meme_score` column so the
  UI can show confidence on each thumbnail.
- **`/no-people` — Photos without People.** Active photos that have a
  `face_scan_status` row (i.e., were scanned) but **zero** rows in `faces`.
  Useful for triaging non-people shots after the face sweep. Caveat: face-api's
  SSD MobileNet at default 0.5 confidence misses profiles, small/distant faces,
  and back-of-head shots — so this view contains some photos with people the
  detector missed. It's "no detected faces", not "no people".

Both queries live in `PhotoRepository.getScreenshotCandidates(...)` and
`PhotoRepository.getPhotosWithoutPeople(...)`.

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

- `@vladmandic/face-api` (maintained fork of `face-api.js`) + `@tensorflow/tfjs-node@4` for the libtensorflow C++ backend (~70× faster than the pure-JS fallback)
- SSD MobileNet for detection, 128-dim embeddings for recognition
- DBSCAN clustering groups similar faces into people
- **Runs in a Node worker thread** (`src/scanner/face-worker.ts`) so the API thread stays responsive during long sweeps. Crucially the worker imports `@tensorflow/tfjs-node` BEFORE `@vladmandic/face-api` — otherwise face-api falls back to the slow pure-JS runtime
- Three person states:
  - **named** — visible everywhere
  - **hidden** — filters out every photo containing that person's face from timeline / folders / search / favorites / similar / map / slideshow / stats (per the Settings "Hidden content" override) plus removes the person card from /people
  - **ignored** — removed from People view, photos still show in timeline (strangers)
- "Manage ignored" toggle to review/reinstate
- Status buttons toggle (click again to revert to unreviewed)
- Face scan cancellable from Settings UI
- **Sweep behavior:** the cron runs a bounded 50-photo daily drip via `runFaceScanWorker(..., 50)`. The Settings "Scan for Faces" button calls `runFaceScanWorker(..., 50, /* sweepAll */ true)` which keeps re-fetching the next 50 unscanned photos until the entire backlog is processed (or the user cancels). All other bulk jobs (thumbnails, pHash, GPS, embeddings) already swept the full backlog via different mechanisms — face was the outlier
- **Dev mode caveat:** `face-worker.ts` is loaded via `new Worker(path)` (not a static import), so tsx's hot-reload doesn't watch it. Edits require a manual backend restart. The dev path in `faces.ts` detects `.ts` source vs compiled `.js` and passes `execArgv: ['--import', 'tsx']` so the worker can load TypeScript directly

## TV Integration

- **Slideshow:** `/tv` route — fullscreen, auto-advance, arrow keys, album filter
- **DLNA:** Auto-discovered by smart TVs as "Photo Manager"
- **Default TV album:** auto-created on server start, filter slideshow with `?album=ID`
- Start/stop DLNA from Settings page

## Background Processing

The daily cron (default 2 AM, `PM_CRON_HOUR`) runs in this order:

1. **Trash auto-purge** — `unlink` files + thumbs older than retention; remove DB rows
2. **Re-index** — incremental walk, mtime-based skip; new files indexed in batches
3. **Thumbnail reconcile** — `thumbnail_path` set in DB but file missing on disk → set NULL (self-heals DB↔disk drift). Runs before the backfill below so freshly-NULLed rows get regenerated in the same nightly run
4. **Thumbnail backfill** — up to 200 missing thumbnails generated
5. **Perceptual hash backfill** — up to 500 missing dHashes computed
6. **Face scan (worker)** — 50-photo batch; clusters faces if any new found
7. **Visual embeddings** — 100-photo batch (MobileNet v2)

Manual triggers (Settings page, all cancellable):
- "Generate thumbnails" — full sweep of missing thumbs
- "Compute hashes" (Duplicates → Near tab) — full sweep of missing dHashes
- "Scan for faces" — face worker on all unscanned photos
- "Scan for GPS" — re-extract GPS from EXIF for photos missing coords
- "Embed photos" — full sweep of missing visual embeddings

For first-time setup of a 120k-photo library: **manual triggers are far faster** than waiting for the daily-cron drip.

## Target Deployment: Raspberry Pi

- Pi 5 (8GB recommended) — sharp and the tfjs-node C++ backend are memory-hungry
- **Node 22 LTS** (not 24) — `@tensorflow/tfjs-node@4` ships napi-v8 prebuilds that don't load on Node 24. Pi base image must use Node 22.
- ARM64 Docker images (`linux/arm64`); cross-build verified via `./scripts/test-arm64-build.sh --smoke`
- SQLite — no PostgreSQL overhead
- Thumbnail cache on USB SSD to avoid SD card wear
- Tailscale for remote access (no port forwarding); `tailscale serve --https=443 http://localhost:80` provides automatic Let's Encrypt certs at a `*.ts.net` URL — required for PWA install on phones (HTTP isn't a secure context for service workers)
- PWA installable to phone home screen — install from the HTTPS tailnet URL so the same install works on LAN and remote
- Full deploy procedure: see `docs/pi-deployment.md`

## Future / Not Yet Implemented

- Phone library auto-detection on iOS Safari (no FileSystemAccess API)
- Periodic Background Sync (vs. one-shot Background Sync) for periodic phone-library re-scans
- Face detection on uploaded photos in the request path (currently waits for daily cron)
- Trim mode for video uploads (currently uploads whole videos)
- HEIC support on the phone-side hashing path (current: relies on browser File API)
