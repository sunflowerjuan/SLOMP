# Headless LibreOffice behind a tiny HTTP API:
#   POST /convert  (body: raw .docx)  ->  application/pdf
#   GET  /health
# No npm dependencies, so there is no install step.
FROM node:24-bookworm-slim

# writer-only LibreOffice (no GUI/Java) plus metric-compatible fonts so the
# PDF layout matches Word documents that use Arial/Times/Calibri.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer fonts-liberation fonts-dejavu-core fonts-crosextra-carlito \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./

ENV NODE_ENV=production HOME=/tmp
USER node
EXPOSE 3001
CMD ["node", "server.mjs"]
