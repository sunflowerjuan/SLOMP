# pdf-function

Headless LibreOffice behind a small HTTP API, packaged as a container.

| Endpoint | Description |
|---|---|
| `POST /convert` | Body: raw `.docx` bytes. Responds `application/pdf`. |
| `GET /health` | Liveness check. |

Errors are `{ "code": ... }`: `INVALID_DOCX` (400), `TOO_LARGE` (413, over 10 MB), `BUSY` (503, over `MAX_CONCURRENT_CONVERSIONS`), `CONVERSION_TIMEOUT` (504), `CONVERSION_FAILED` (500).

| Variable | Default |
|---|---|
| `PORT` | `3001` |
| `LIBREOFFICE_BIN` | `/usr/bin/soffice` |
| `CONVERT_TIMEOUT_MS` | `25000` |
| `MAX_CONCURRENT_CONVERSIONS` | `2` |

```bash
docker compose up -d pdf
apps/pdf-function/test/smoke.sh   # converts test/sample.docx and checks the PDF
```

The backend uses this service when `PDF_SERVICE_URL` is set (see `apps/backend/.env.example`); otherwise it converts with a local LibreOffice.
