import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 3001);
const SOFFICE = process.env.LIBREOFFICE_BIN ?? '/usr/bin/soffice';
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const CONVERT_TIMEOUT_MS = Number(process.env.CONVERT_TIMEOUT_MS ?? 25_000);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_CONVERSIONS ?? 2);

// A .docx is a zip archive; anything else is rejected before LibreOffice sees it.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

let running = 0;

async function convert(docx) {
  const dir = await mkdtemp(join(tmpdir(), 'docx-pdf-'));
  try {
    const input = join(dir, 'input.docx');
    await writeFile(input, docx);
    // Own profile per call: concurrent soffice runs collide on the shared one.
    await execFileAsync(
      SOFFICE,
      [
        '--headless',
        '--norestore',
        `-env:UserInstallation=file://${join(dir, 'profile')}`,
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        input,
      ],
      { timeout: CONVERT_TIMEOUT_MS },
    );
    return await readFile(join(dir, 'input.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { status: 'ok' });
  }
  if (req.method !== 'POST' || req.url !== '/convert') {
    return send(res, 404, { code: 'NOT_FOUND' });
  }
  if (running >= MAX_CONCURRENT) {
    res.setHeader('Retry-After', '5');
    return send(res, 503, { code: 'BUSY' });
  }

  running += 1;
  try {
    const docx = await readBody(req);
    if (docx.length < 4 || !docx.subarray(0, 4).equals(ZIP_MAGIC)) {
      return send(res, 400, { code: 'INVALID_DOCX' });
    }
    const pdf = await convert(docx);
    send(res, 200, pdf, 'application/pdf');
  } catch (error) {
    if (error.status === 413) return send(res, 413, { code: 'TOO_LARGE' });
    console.error('conversion failed:', error.killed ? 'timeout' : error.message);
    send(res, error.killed ? 504 : 500, {
      code: error.killed ? 'CONVERSION_TIMEOUT' : 'CONVERSION_FAILED',
    });
  } finally {
    running -= 1;
  }
}).listen(PORT, () => console.log(`pdf service listening on ${PORT}`));
