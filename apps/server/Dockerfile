# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /repo

# ---- deps: install workspace dependencies once, shared by later stages ----
FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# ---- build web: produces apps/web/dist ----
FROM deps AS build-web
COPY apps/web apps/web
RUN npm run build --workspace apps/web

# ---- build server: produces apps/server/dist ----
FROM deps AS build-server
COPY apps/server apps/server
RUN npm run build --workspace apps/server

# ---- prod-deps: server's production dependencies only (no devDependencies) ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace apps/server --include-workspace-root=false

# ---- runtime: slim image with only production deps + built output ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffprobe (bundled with ffmpeg) is used at scan time to read video duration/
# resolution/codec — no transcoding happens in v1, just inspection.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY apps/server/package.json ./package.json
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build-server /repo/apps/server/dist ./dist
COPY --from=build-web /repo/apps/web/dist ./web-dist

EXPOSE 3000
CMD ["node", "dist/app.js"]
