# PDF service: POST /render, the pdf-work queue consumer and the legacy
# POST /convert, on headless LibreOffice.
# Build context is the repo root (pnpm workspace):
#   docker build -f apps/pdf-function/Dockerfile .
# Node 24 runs the TypeScript sources directly, so there is no build step.

FROM node:24-bookworm-slim AS deploy
ENV HUSKY=0
RUN npm install -g pnpm@11.24.0
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/pdf-function/package.json apps/pdf-function/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter pdf-function

COPY apps/pdf-function apps/pdf-function
RUN pnpm --filter pdf-function --prod --legacy deploy /out/pdf-function

FROM node:24-bookworm-slim AS runtime
# writer-only LibreOffice (no GUI/Java) plus metric-compatible fonts so the
# PDF layout matches Word documents that use Arial/Times/Calibri.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer fonts-liberation fonts-dejavu-core fonts-crosextra-carlito \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deploy --chown=node:node /out/pdf-function ./
ENV NODE_ENV=production HOME=/tmp
USER node
EXPOSE 3001
CMD ["node", "src/main.ts"]
