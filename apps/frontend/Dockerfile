# Administrator panel built and served by Caddy, which is also the production
# reverse proxy (TLS, /api -> backend). See apps/frontend/Caddyfile.
# Build context is the repo root (pnpm workspace):
#   docker build -f apps/frontend/Dockerfile --build-arg VITE_API_URL=https://<domain>/api .

FROM node:24-bookworm-slim AS build
ENV HUSKY=0
RUN npm install -g pnpm@11.24.0
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/pdf-function/package.json apps/pdf-function/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter frontend

COPY apps/frontend apps/frontend
# Vite bakes the API URL into the bundle, so it is fixed at build time.
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" && pnpm --filter frontend build

FROM caddy:2.10-alpine AS runtime
COPY apps/frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/frontend/dist /srv
