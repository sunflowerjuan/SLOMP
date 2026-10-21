# Build context is the repo root (pnpm workspace):
#   docker build -f apps/backend/Dockerfile .
#
# `pnpm deploy` materialises a self-contained node_modules for the backend
# inside the image, so nothing relies on the zip-deploy repackaging that
# breaks pnpm's nested symlinks on App Service.

FROM node:24-bookworm-slim AS build
ENV HUSKY=0
RUN npm install -g pnpm@11.24.0
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
# Lifecycle scripts stay off (Sonar S6505); the two that matter run explicitly:
# bcrypt's native build here, and Prisma's engine download in `rebuild`.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter backend --filter shared \
 && pnpm rebuild bcrypt @prisma/engines prisma

COPY packages/shared packages/shared
COPY apps/backend apps/backend
# prisma.config.ts requires DATABASE_URL to be set even for `generate`, which
# never connects; this placeholder only exists for that one command.
RUN DATABASE_URL=postgresql://localhost:5432/build pnpm --filter shared db:generate \
 && pnpm --filter backend build

# Also the image used by `migrate` in docker-compose.yml (needs the Prisma
# CLI). Branches off before `pnpm deploy`, which leaves /repo's node_modules
# in a state pnpm then wants to reinstall before running scripts.
FROM build AS tooling

FROM build AS deploy
RUN pnpm --filter backend --prod --legacy deploy /out/backend

# `prisma generate` writes the client next to @prisma/client's pnpm store
# entry, and `pnpm deploy` doesn't carry that generated folder over. Copy it
# into the deployed copy (the entry's hash suffix differs between the two).
RUN set -eu; \
    src=$(find /repo/node_modules/.pnpm -maxdepth 4 -type d -name .prisma -path '*@prisma+client@*' | head -n 1); \
    dest=$(find /out/backend/node_modules/.pnpm -maxdepth 2 -type d -path '*@prisma+client@*/node_modules' | head -n 1); \
    test -n "$src" && test -n "$dest"; \
    cp -r "$src" "$dest/"

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy --chown=node:node /out/backend ./
COPY --from=build --chown=node:node /repo/apps/backend/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
