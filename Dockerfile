# ── Stage 1: Build Angular app ──
FROM node:22-bookworm-slim AS web-build

WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npx ng build --configuration production

# ── Stage 2: Build backend ──
FROM node:22-bookworm-slim AS api-build

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npx tsc -p tsconfig.build.json

# ── Stage 3: Production image ──
FROM node:22-bookworm-slim

# Install runtime dependencies for sharp (HEIC/HEIF support) and ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    libheif-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built backend
COPY --from=api-build /build/dist ./dist

# Copy built Angular app
COPY --from=web-build /build/web/dist/photo-manager/browser ./web/dist/photo-manager/browser

# Create data directory
RUN mkdir -p /data/thumbnails

ENV PM_MEDIA_ROOT=/photos \
    PM_DB_PATH=/data/photos.db \
    PM_THUMBNAIL_DIR=/data/thumbnails \
    PM_DROPBOX_DIR=/data/inbox \
    PM_PORT=3000 \
    PM_HOST=0.0.0.0 \
    PM_LOG_LEVEL=info \
    NODE_ENV=production

EXPOSE 3000

VOLUME ["/photos", "/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server/index.js"]
