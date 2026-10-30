// Uploads a .docx template through the running API, e.g. to install a
// municipality's first template without the panel:
//
//   pnpm --filter backend templates:upload <slug> LIQUIDACION <file.docx>
//
// Environment: ADMIN_EMAIL (required), ADMIN_PASSWORD (default: the development
// seed password) and API_URL (default http://localhost:3000).
import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';

const [slug, documentType, file] = process.argv.slice(2);
if (!slug || !documentType || !file) {
  console.error(
    'Usage: upload-template.mjs <municipality-slug> <LIQUIDACION|MANDAMIENTO> <file.docx>',
  );
  process.exit(2);
}

const adminEmail = process.env.ADMIN_EMAIL;
if (!adminEmail) {
  console.error('Define ADMIN_EMAIL');
  process.exit(2);
}

// Same rule as the PDF service's sanitizeForLog (apps/pdf-function/src/log.ts):
// drops control characters, CR/LF included, so a value can't forge an output
// line, and caps its length.
function sanitizeForLog(value) {
  return String(value)
    .replaceAll(/[\p{Cc}\u2028\u2029]/gu, '')
    .slice(0, 200);
}

// Drops trailing slashes with a loop: /\/+$/ backtracks on a run of them.
let api = process.env.API_URL ?? 'http://localhost:3000';
while (api.endsWith('/')) api = api.slice(0, -1);

async function call(path, init) {
  const response = await fetch(`${api}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`${sanitizeForLog(path)} answered ${response.status}:`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  return body;
}

const { accessToken } = await call('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: adminEmail,
    password: process.env.ADMIN_PASSWORD ?? 'changeme123',
  }),
});

let blob;
try {
  blob = await openAsBlob(file);
} catch (error) {
  console.error(`Cannot read ${sanitizeForLog(file)}: ${error.code ?? 'error'}`);
  process.exit(2);
}

const form = new FormData();
form.set('documentType', documentType);
form.set('file', blob, basename(file));

const template = await call(`/municipalities/${encodeURIComponent(slug)}/templates`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
console.log(
  `${template.isActive ? 'Active' : 'Stored'}: ${template.documentType} version ${template.version} (${sanitizeForLog(template.fileName)})`,
);
