# Raspberry Pi 5 Deployment — Action Plan

Migration from amd64 dev box → arm64 Raspberry Pi 5, using `docker save`/`docker load`
plus a USB stick to carry both the image and the database. No registry required.

## Target hardware

- Raspberry Pi 5, **8 GB** model (4 GB is tight under face/embedding bursts)
- USB 3.0 SSD for `/data` (DB + thumbs + face models) — avoid SD card wear
- NAS reachable via cifs/SMB at a system-level mount (NOT GVFS)
- Tailscale account — used for `tailscale serve` to terminate HTTPS at a
  `*.ts.net` URL, which is what unlocks PWA install on phones (HTTP on a
  LAN IP isn't a secure context for service workers). It also gives you
  remote access without port-forwarding.

## Performance expectations on Pi 5

Measured on an amd64 dev box with AVX512: face detection runs ~14 photos/sec
via the libtensorflow C++ backend. Pi 5 (Cortex-A76, no AVX512) is roughly
5–10× slower for this workload — expect **~1.5–3 photos/sec** for face
detection. Concrete implications:

- A fresh sweep of 107k photos on Pi: **10–20 hours**. Avoid doing this on
  the Pi — populate the DB on the dev box first, ship the data tarball.
- Cron's nightly drip (50 photos/run) finishes in **20–30 seconds**.
- Manual "Scan for Faces" via Settings will sweep the entire backlog and
  shows live progress; the cron can run alongside it.
- Thumbnail generation is much faster (sharp uses libvips; scales near
  linearly with cores) — you can comfortably regenerate the whole
  thumbnail cache in an hour or two if needed.

## Runtime version pin

Build, image, and Pi must all use **Node 22 LTS**. `@tensorflow/tfjs-node@4`
ships napi-v8 prebuilds that don't load on Node 24 ("Module did not
self-register"). The Dockerfile uses `node:22-bookworm-slim`; if you ever bump
the base image, stay on the 22 line until tfjs-node ships Node 24 prebuilds.

## Pre-flight on the dev box

### 1. Cross-build the arm64 image

```bash
./scripts/test-arm64-build.sh --smoke
```

This:
- Installs QEMU binfmt handlers if missing
- Creates the `pm-arm64-builder` buildx builder
- Cross-builds `photo-manager:arm64` (5–15 min via emulation)
- Boots the resulting image under qemu and curls `/health` to catch runtime issues

If it fails, the script prints the most likely causes (tfjs-node ABI mismatch
under Node 24 — pin Node 22 LTS in the Dockerfile if not already; canvas native
compile failures; libheif headers).

### 2. Save the image as a zstd tarball

```bash
docker save photo-manager:arm64 | zstd -T0 -19 > pm-arm64.tar.zst
sha256sum pm-arm64.tar.zst > pm-arm64.tar.zst.sha256
```

Expected size: ~600 MB – 1 GB compressed.

### 3. Snapshot the database safely

SQLite WAL mode requires a clean shutdown to flush the WAL into the main DB.
Easiest: stop the container first.

```bash
# Stop so SQLite checkpoints WAL on shutdown
docker compose down

# Snapshot data/ (DB, thumbnails, face models)
tar -C data --use-compress-program='zstd -T0 -19' -cf pm-data.tar.zst .
sha256sum pm-data.tar.zst > pm-data.tar.zst.sha256
```

If you can't stop the container, force a checkpoint instead:
```bash
sqlite3 data/photos.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### 4. Copy artifacts to USB

```bash
cp pm-arm64.tar.zst pm-arm64.tar.zst.sha256 \
   pm-data.tar.zst  pm-data.tar.zst.sha256 \
   /media/$USER/<usb-mount>/
sync
udisksctl power-off -b /dev/<usb-device>
```

## Pi setup (one-time)

### 5. OS prerequisites

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 cifs-utils zstd
sudo usermod -aG docker $USER
# Log out/in for group to take effect
```

### 6. Mount the USB SSD

Add to `/etc/fstab` (find UUID with `blkid`):
```
UUID=<ssd-uuid>  /mnt/ssd  ext4  defaults,noatime,nofail  0  2
```
Then:
```bash
sudo mkdir -p /mnt/ssd
sudo mount -a
sudo mkdir -p /mnt/ssd/photo-manager/{data,inbox}
sudo chown -R $USER:$USER /mnt/ssd/photo-manager
```

### 7. Mount the NAS via cifs

Create `/etc/photo-manager.smbcredentials` (chmod 600), then add to `/etc/fstab`:
```
//wd.personal.hq.millabs.net/photos  /mnt/photos  cifs  credentials=/etc/photo-manager.smbcredentials,uid=1000,gid=1000,iocharset=utf8,nofail,_netdev,x-systemd.automount  0  0
```
```bash
sudo mkdir -p /mnt/photos
sudo mount -a
ls /mnt/photos    # confirm it's readable
```

### 8. Install Tailscale + set up HTTPS via `tailscale serve`

This gives the photo manager an `https://*.ts.net` URL that works from your
phone both at home (Tailscale routes peer-to-peer over LAN) and remotely.
The HTTPS URL is what makes PWA install possible — phones won't register
service workers over plain HTTP on a LAN IP.

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate this device against your tailnet (opens a one-time URL)
sudo tailscale up

# Confirm the device's MagicDNS hostname (something like
# photo-manager.tail-XXXX.ts.net). Rename the device in the Tailscale admin
# console if you want a friendlier name.
tailscale status
```

Once `docker compose ... up` is running on port 80 (step 13), enable
`tailscale serve` to terminate TLS and proxy to it:

```bash
sudo tailscale serve --bg --https=443 http://localhost:80
sudo tailscale serve status   # confirm the binding
```

Tailscale fetches a Let's Encrypt cert automatically and renews it. Only
devices logged into your tailnet can reach the URL — `serve` is private,
unlike `funnel` which would expose to the public internet.

> **⚠ Trust-proxy caveat.** With `tailscale serve` proxying to `localhost`,
> the photo-manager backend sees `127.0.0.1` for every request — which the
> network guard treats as private, so destructive endpoints (trash empty,
> permanent delete) would become reachable to *every* tailnet user, defeating
> the "remote browse OK, remote delete no" policy. The fix is enabling
> Fastify's `trustProxy: 'loopback'` so the backend reads the real client IP
> from the `X-Forwarded-For` header that `tailscale serve` injects. **Until
> that's enabled, leave `tailscale serve` off** or set
> `PM_ALLOW_REMOTE=false` and accept that browsing is also blocked.

### 9. Pull the project source

The Dockerfile and compose files need to be on the Pi (small — git clone is fine):
```bash
git clone https://github.com/rburckner/photo-manager ~/photo-manager
cd ~/photo-manager
```

## Migration — image + data

### 10. Verify and load the image

```bash
cd /media/$USER/<usb-mount>
sha256sum -c pm-arm64.tar.zst.sha256
zstd -d < pm-arm64.tar.zst | docker load
docker image ls photo-manager:arm64    # confirm it landed
```

### 11. Verify and extract data

```bash
sha256sum -c pm-data.tar.zst.sha256
tar -C /mnt/ssd/photo-manager/data \
    --use-compress-program='zstd -d' \
    -xf pm-data.tar.zst
ls /mnt/ssd/photo-manager/data    # confirm photos.db, thumbnails/, face-models/
```

### 12. Configure `.env` on the Pi

In `~/photo-manager/.env`:
```bash
PM_HOST_PHOTOS_DIR=/mnt/photos
PM_HOST_DATA_DIR=/mnt/ssd/photo-manager/data
PM_HOST_INBOX_DIR=/mnt/ssd/photo-manager/inbox

# When `tailscale serve` proxies to localhost AND the backend has
# trustProxy='loopback' (planned phase 2), Tailscale clients show up to
# the network guard with their real 100.x.x.x address — which is non-
# private, so PM_ALLOW_REMOTE=true is needed to unblock browsing.
# Destructive endpoints (trash empty, permanent delete) still reject
# non-private IPs regardless of this flag, preserving the
# "remote browse OK, remote delete no" policy.
PM_ALLOW_REMOTE=true
```

### 13. Start the stack

```bash
cd ~/photo-manager
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d
```

Compose uses `photo-manager:arm64` from the local image store (the override sets
`image: photo-manager:arm64`, which shadows the base file's `build:` directive
when the image is present).

### 14. Verify

```bash
# On the Pi: liveness + readiness via the local port
curl -s http://localhost/health | jq .
curl -sw "%{http_code}\n" -o /dev/null http://localhost/health/ready
# Expect: 200

# Container status + logs
docker compose ps
docker compose logs -f --tail=50

# From any device on your tailnet: HTTPS via tailscale serve
curl -s https://photo-manager.tail-XXXX.ts.net/health | jq .
```

Open `https://photo-manager.tail-XXXX.ts.net/` in a browser. Settings page
should show the green NAS chip and the daily cron should be scheduled.

### 15. Install the PWA on your phone

Once the HTTPS Tailscale URL is reachable from your phone (Tailscale app
installed and logged in):

- **iOS Safari:** Open the URL → tap Share → "Add to Home Screen". The icon
  becomes a standalone app with no browser chrome.
- **Android Chrome:** Open the URL → menu → "Install app" or "Add to Home
  Screen". Same standalone behavior.

Why HTTPS matters: phones refuse to register service workers (and therefore
won't offer install or run Background Sync uploads) over plain HTTP on a
LAN IP. The `*.ts.net` URL is the secure-context that unlocks PWA features.

Why install from the tailnet URL specifically: PWAs are origin-locked. An
install captures the host you're on. If you install at `http://<pi-ip>` you
get a PWA tied to that LAN IP that breaks the moment you leave home. The
tailnet URL works at home (Tailscale routes peer-to-peer over LAN) and away.

## Post-migration cleanup

Once verified:
- On the dev box: `docker volume rm photo-manager-data` (the orphaned named volume)
- Wipe the USB stick or keep as a cold backup of the migration snapshot

## Update workflow (future)

When you change code:
1. On dev box: `./scripts/test-arm64-build.sh` (rebuild)
2. `docker save photo-manager:arm64 | zstd -T0 > pm-arm64.tar.zst`
3. scp/USB to Pi
4. On Pi: `zstd -d < pm-arm64.tar.zst | docker load`
5. On Pi: `docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d`
   (recreates the container with the new image; data persists in the bind mount)

## Rollback

If the Pi deployment misbehaves and you want to restart from scratch:
```bash
docker compose -f docker-compose.yml -f docker-compose.pi.yml down
rm -rf /mnt/ssd/photo-manager/data/*
# Re-extract pm-data.tar.zst from the USB stick
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` shows `nas: missing` | NAS not mounted, or `PM_HOST_PHOTOS_DIR` typo | `mount \| grep photos`; check `.env` |
| `/health` shows `nas: ro` | cifs mounted with wrong uid or read-only flag | Check fstab options, remount |
| `/health/ready` returns 503 | NAS state is anything other than `rw` | See the two rows above |
| Container restarts on boot | OOM (4 GB Pi) | Drop `mem_limit` in override, or upgrade to 8 GB |
| `tfjs-node` errors at startup, "Module did not self-register" | Wrong Node version (must be 22 LTS, NOT 24) or stale ABI | Confirm `node --version` is 22.x; rebuild image |
| `forwardFunc_1 is not a function` | Old `face-api.js` (unmaintained) loaded against tfjs 4 | Already migrated to `@vladmandic/face-api` — verify lockfile pins it |
| HEIC photos render as ladybug; thumbnails blank or 0 bytes; "No decoding plugin installed" in logs | sharp built without HEVC decoder | The Dockerfile compiles sharp against system libvips (with libheif + libde265 + HEVC plugin). If you see this on the Pi, the image build skipped that step — rebuild with the current `Dockerfile`. The `native-deps` stage with `SHARP_FORCE_GLOBAL_LIBVIPS=1` is what links sharp to the codec-equipped libvips. |
| Face scan ~10× slower than expected | tfjs-node's C++ backend didn't load; falling back to pure-JS | Backend log will show `Looks like you are running TensorFlow.js in Node.js`. Check `face-worker.ts` imports `@tensorflow/tfjs-node` BEFORE `@vladmandic/face-api` |
| All thumbnails blank | Thumbnail dir empty + sharp can't decode HEIC | Check `data/thumbnails/` extracted; trigger backfill from Settings |
| Compose tries to build on `up` | Image not loaded, or wrong tag | `docker image ls`; ensure `photo-manager:arm64` exists |
| PWA install option doesn't appear on phone | Site is HTTP, or you're hitting the LAN IP instead of the `.ts.net` URL | Use the HTTPS Tailscale URL — service workers require a secure context |
| `https://*.ts.net` URL returns "connection refused" | `tailscale serve` not enabled, or wrong target port | `sudo tailscale serve status`; if empty, re-run the `serve --bg --https=443 http://localhost:80` command |
| `tailscale serve` errors with "no such host" / "operation not permitted" | Tailscale daemon not running, or HTTPS feature not enabled in admin console | `sudo systemctl status tailscaled`; in the Tailscale admin, enable "HTTPS Certificates" under DNS settings |
| Destructive endpoints (trash empty, permanent delete) reachable to all tailnet users | Phase 2 backend change (`trustProxy: 'loopback'`) not deployed yet | Either deploy phase 2 or leave `tailscale serve` off and access only on LAN |
| All photos suddenly 404 after working fine | NAS unmounted (cifs flapping) | `/health` will show `nas: missing`; remount; the cron's 5-minute re-probe will pick it up automatically |
