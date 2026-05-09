#!/usr/bin/env bash
#
# Cross-build the photo-manager image for linux/arm64 from this amd64 dev box.
# Goal: catch ARM-only build failures (tfjs-node prebuilds, canvas native compile,
# sharp/libvips bindings, etc.) BEFORE moving to the Pi.
#
# Usage:
#   ./scripts/test-arm64-build.sh           # build only, do not run
#   ./scripts/test-arm64-build.sh --smoke   # build, then start a throwaway
#                                           # container under qemu and curl /health
#
# This does NOT push anywhere. The image is loaded locally as photo-manager:arm64.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[FAIL]${NC} $1"; }
log_step()  { echo -e "\n${YELLOW}==>${NC} $1"; }

IMAGE_TAG="photo-manager:arm64"
BUILDER_NAME="pm-arm64-builder"
SMOKE=false

for arg in "$@"; do
  case "$arg" in
    --smoke) SMOKE=true ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^#//' | head -n 12
      exit 0
      ;;
  esac
done

# ── 1. Verify Docker + buildx ──
log_step "Checking Docker + buildx"
if ! command -v docker &>/dev/null; then
  log_err "docker is not installed"
  exit 1
fi
if ! docker buildx version &>/dev/null; then
  log_err "docker buildx is not available — install Docker Desktop or docker-buildx-plugin"
  exit 1
fi
log_ok "buildx $(docker buildx version | awk '{print $2}')"

# ── 2. Register QEMU binfmt handlers if missing ──
log_step "Checking QEMU emulation for arm64"
if ! docker buildx ls | grep -q "linux/arm64"; then
  log_warn "arm64 platform not registered — installing QEMU binfmt handlers"
  docker run --privileged --rm tonistiigi/binfmt --install arm64
  log_ok "binfmt handlers installed"
else
  log_ok "arm64 platform already registered"
fi

# ── 3. Create a docker-container builder (needed for proper multi-arch caching) ──
log_step "Ensuring buildx builder exists"
if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
  log_ok "Created builder $BUILDER_NAME"
else
  log_ok "Builder $BUILDER_NAME already exists"
fi

# ── 4. Cross-build for linux/arm64 ──
log_step "Building image for linux/arm64 (this is the slow step — 5–15 min via emulation)"
START=$(date +%s)

# --load brings the result into the local docker image store so we can run it.
# --load only supports a single platform per invocation, so we explicitly pass
# linux/arm64 here even though the Dockerfile is platform-agnostic.
if docker buildx build \
    --builder "$BUILDER_NAME" \
    --platform linux/arm64 \
    --tag "$IMAGE_TAG" \
    --load \
    .; then
  END=$(date +%s)
  ELAPSED=$((END - START))
  log_ok "ARM64 build succeeded in ${ELAPSED}s"
else
  log_err "ARM64 build FAILED — see output above"
  log_warn "Common causes:"
  log_warn "  • @tensorflow/tfjs-node 3.x has no ARM64 prebuilt for Node 22 → bump to 4.x"
  log_warn "  • canvas native build fails → install build-essentials/cairo headers in the Dockerfile"
  log_warn "  • sharp/libheif headers missing → check apt-get list in the Dockerfile"
  exit 1
fi

# ── 5. Report image size ──
log_step "Image stats"
docker image ls "$IMAGE_TAG" --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}'

# ── 6. Optional smoke test: boot the image under qemu and hit /health ──
if [ "$SMOKE" = "true" ]; then
  log_step "Smoke test: starting container under qemu"
  CONTAINER_ID=$(docker run -d --rm \
    --platform linux/arm64 \
    -p 13000:3000 \
    -e PM_MEDIA_ROOT=/tmp/empty \
    -e PM_DB_PATH=/tmp/photos.db \
    -e PM_THUMBNAIL_DIR=/tmp/thumbs \
    -e PM_DROPBOX_DIR=/tmp/inbox \
    "$IMAGE_TAG")
  log_ok "Container $CONTAINER_ID started, waiting for boot..."

  # Give it up to 60s to become ready (qemu-emulated arm64 on amd64 is slow)
  READY=false
  for _ in $(seq 1 60); do
    if curl -sf http://localhost:13000/health >/dev/null 2>&1; then
      READY=true
      break
    fi
    sleep 1
  done

  if [ "$READY" = "true" ]; then
    log_ok "/health responded"
    curl -s http://localhost:13000/health | head -c 500
    echo ""
  else
    log_err "/health never came up — check container logs:"
    docker logs "$CONTAINER_ID" | tail -40
    docker stop "$CONTAINER_ID" >/dev/null
    exit 1
  fi

  docker stop "$CONTAINER_ID" >/dev/null
  log_ok "Smoke test passed — image boots cleanly under qemu"
fi

echo ""
log_ok "Done. Image is ready: $IMAGE_TAG"
echo ""
echo "Next steps:"
echo "  • Tag for your registry: docker tag $IMAGE_TAG ghcr.io/youruser/photo-manager:arm64"
echo "  • Or save to tarball:    docker save $IMAGE_TAG | gzip > pm-arm64.tar.gz"
echo "  • Then load on the Pi:   docker load < pm-arm64.tar.gz"
