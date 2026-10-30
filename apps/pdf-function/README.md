# pdf-function

PDF generator for SLOMP, packaged as a container with headless LibreOffice. It renders `.docx` templates with docxtemplater and converts them to PDF in two modes:

- **Individual:** `POST /render`, synchronous, answers with the PDF.
- **Bulk:** consumer of the `pdf-work` queue (`render-batch` and `assemble-zip` messages); it uploads the PDFs and the ZIP to Blob and reports to `pdf-results`.

It only talks to Azure Storage (Blob and Queue): it never touches the database and applies no business rules. The data, file names and folders come already built by the backend. The full contract (messages, states, retries, error codes) is the Confluence page "Servicio de PDF: contrato entre backend y worker (SL-118)".

Written in TypeScript that Node 24 runs directly (type stripping): there is no build step. `pnpm --filter pdf-function build` only type-checks.

## HTTP

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness check. |
| `POST /render` | Header `X-Internal-Key`. Body `{ schemaVersion: 1, documentType, template: { blob, sha256 }, data }`. Responds `application/pdf`. |

`/render` errors (`{ code, message }`): `INVALID_REQUEST` (400), `UNAUTHORIZED` (401), `TOO_LARGE` (413), `TEMPLATE_RENDER_FAILED` (422, the data doesn't fit the template), `TEMPLATE_INVALID` (500), `CONVERSION_FAILED` (500), `TEMPLATE_UNAVAILABLE` (503, missing template, hash mismatch or Storage not configured), `BUSY` (503 + `Retry-After`), `CONVERSION_TIMEOUT` (504).

## Queue

Messages are plain JSON text (not base64). Blob paths start with the container (`templates/...`, `pdf-jobs/...`); only those two containers are accepted.

- Each slot (`WORKER_CONCURRENCY`) keeps its own LibreOffice profile, reused across batches, with macros disabled, and converts at the lowest CPU priority (`nice -n 19`). A batch (40 documents, the backend's `BATCH_SIZE`) is merged into one `.docx` and converted in a single `soffice` call (`src/merge.ts`): each document is its own section, so page numbers restart, and the header gets a copy per document whose `NUMPAGES` becomes a `PAGEREF` to a bookmark at the end of that document, so "Página X de Y" stays right. A bookmark at each start becomes a named destination and the PDF is split there with pdf-lib. On 1 vCPU that is about 0.29 s a document (0.43 s converting 10 separate files per call). Templates with another layout (several sections, a different first page, even/odd headers, markers in the header) or a merged PDF that can't be split go back to converting the documents of the batch separately. `/render` has its own slots (`RENDER_SLOTS`), warmed up at startup, so a bulk job never blocks individual PDFs; each one starts `soffice` for its PDF. The image runs LibreOffice 25.2 (Debian 13), which starts in 0.4 s: on 1 vCPU an individual PDF takes about 1 s, and 2.2 s (max 3.1 s) next to a bulk job. The profile exports untagged PDFs (25.2 tags them by default, which made them much heavier).
- The consumer only receives as many messages as it has free slots.
- Permanent errors (invalid message or input, missing template, data that doesn't fit, incomplete ZIP) report `FAILED` at once. Transient ones (LibreOffice, Storage) leave the message to reappear after `QUEUE_VISIBILITY_SECONDS`; on attempt `MAX_ATTEMPTS` they report `FAILED` and copy the message to `pdf-work-poison`.
- Result codes: `INVALID_MESSAGE`, `PDF_TEMPLATE_UNAVAILABLE`, `PDF_TEMPLATE_INVALID`, `TEMPLATE_RENDER_FAILED`, `PDF_CONVERSION_TIMEOUT`, `PDF_CONVERSION_FAILED`, `PDF_STORAGE_UNAVAILABLE`, `BULK_ZIP_INCOMPLETE`.

On startup it creates the queues and the `pdf-jobs` and `templates` containers if they don't exist (Azure provisions them; Azurite starts empty).

## Variables

| Variable | Default |
|---|---|
| `PDF_SERVICE_KEY` | **required** (compose sets a local-only value) |
| `AZURE_STORAGE_CONNECTION_STRING` | empty: no queue consumer, `/render` answers 503 |
| `PORT` | `3001` |
| `WORKER_CONCURRENCY` / `RENDER_SLOTS` | CPUs − 1 (min. 1) / `1` |
| `QUEUE_VISIBILITY_SECONDS` / `MAX_ATTEMPTS` / `POLL_INTERVAL_MS` | `300` / `3` / `2000` |
| `PDF_WORK_QUEUE` / `PDF_RESULTS_QUEUE` / `PDF_POISON_QUEUE` | `pdf-work` / `pdf-results` / `pdf-work-poison` |
| `PDF_JOBS_CONTAINER` / `TEMPLATES_CONTAINER` | `pdf-jobs` / `templates` |
| `CONVERT_TIMEOUT_MS` / `LIBREOFFICE_BIN` | `25000` / known install paths |

## Try it locally

```bash
pnpm --filter pdf-function test        # unit tests, no LibreOffice or Azure needed
# Root .env: AZURE_STORAGE_CONNECTION_STRING with Azurite's documented
# development string, endpoints http://azurite:10000 / :10001
docker compose up -d --build azurite pdf
# Same string with 127.0.0.1 endpoints; uses apps/backend/templates/liquidacion-paez.docx
AZURE_STORAGE_CONNECTION_STRING="..." pnpm --filter pdf-function demo 100
```

The demo uploads the template, runs a 100-document bulk job, times `/render` while it runs (must stay under 5 s) and checks the ZIP.
