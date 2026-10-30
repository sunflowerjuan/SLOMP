import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { JobError } from './errors.ts';
import {
  createProfile,
  isCompletePdf,
  resolveSofficeBinary,
  type Slot,
} from './soffice.ts';

// Installed by the image (pip); a fixed list, like soffice.
const KNOWN_UNOSERVER_PATHS = [
  '/usr/local/bin/unoserver',
  '/usr/bin/unoserver',
];

export function resolveUnoserverBinary(
  candidates: readonly string[] = KNOWN_UNOSERVER_PATHS,
): string | undefined {
  return candidates.find((path) => existsSync(path));
}

// unoserver's XML-RPC convert(inpath, indata, outpath, convert_to): the .docx
// goes in and the PDF comes back in the body, so nothing touches the disk.
export function convertRequest(docx: Buffer): string {
  return (
    '<?xml version="1.0"?><methodCall><methodName>convert</methodName><params>' +
    '<param><value><nil/></value></param>' +
    `<param><value><base64>${docx.toString('base64')}</base64></value></param>` +
    '<param><value><nil/></value></param>' +
    '<param><value><string>pdf</string></value></param>' +
    '</params></methodCall>'
  );
}

export function parseConvertResponse(xml: string): Buffer {
  const pdf = /<base64>([^<]*)<\/base64>/.exec(xml);
  if (pdf && !xml.includes('<fault>')) return Buffer.from(pdf[1]!, 'base64');
  const fault =
    /<name>faultString<\/name>\s*<value>(?:<string>)?([^<]*)/.exec(xml)?.[1] ??
    'Unexpected unoserver response.';
  // unoserver reports its own --conversion-timeout as a fault.
  throw new JobError(
    fault.includes('TimeoutError')
      ? 'PDF_CONVERSION_TIMEOUT'
      : 'PDF_CONVERSION_FAILED',
    'LibreOffice failed.',
    undefined,
    { cause: new Error(fault) },
  );
}

const INFO_REQUEST =
  '<?xml version="1.0"?><methodCall><methodName>info</methodName><params/></methodCall>';
// unoserver opens its port once LibreOffice answers: ~12 s on the VPS.
const START_TIMEOUT_MS = 60_000;
let nextPort = 2002;

// A LibreOffice kept running behind unoserver, for /render only. Measured on
// the VPS: ~1.6 s a PDF (3.4-3.9 s starting soffice each time) and 1.6-2.4 s
// next to a bulk batch (3.5-6.0 s), RNF-01 being under 5 s. Bulk batches stay
// on soffice: 10 documents in one call are faster than 10 calls here.
export async function createUnoserverSlot(
  binary: string,
  timeoutMs: number,
): Promise<Slot> {
  const root = await mkdtemp(join(tmpdir(), 'pdf-uno-'));
  const profile = join(root, 'profile');
  await createProfile(profile);
  const port = nextPort;
  nextPort += 2;
  let server: ChildProcess | undefined;
  let ready: Promise<void> | undefined;
  let disposed = false;

  const call = async (body: string, timeout: number) => {
    const response = await fetch(`http://127.0.0.1:${port}/RPC2`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body,
      signal: AbortSignal.timeout(timeout),
    });
    return response.text();
  };

  // The whole process group, so the LibreOffice it started goes too.
  const kill = (child: ChildProcess) => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  };

  // Started again as soon as it dies, so the next PDF doesn't wait for
  // LibreOffice (~12 s on the VPS).
  const restart = () => {
    if (disposed) return;
    const starting = start();
    ready = starting;
    starting.catch(() => {
      if (ready === starting) ready = undefined;
    });
  };

  async function start(): Promise<void> {
    // A killed LibreOffice leaves its lock behind.
    await rm(join(profile, 'user', '.lock'), { force: true });
    const child = spawn(
      binary,
      [
        '--interface',
        '127.0.0.1',
        '--port',
        String(port),
        '--uno-interface',
        '127.0.0.1',
        '--uno-port',
        String(port + 1),
        '--user-installation',
        profile,
        '--executable',
        resolveSofficeBinary(),
        // It kills LibreOffice and exits when a conversion hangs.
        '--conversion-timeout',
        String(Math.ceil(timeoutMs / 1000)),
        '--quiet',
      ],
      { detached: true, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    server = child;
    let up = false;
    child.once('exit', (code) => {
      kill(child);
      if (server !== child) return;
      server = undefined;
      console.log(
        `unoserver on port ${port} exited (${code})${up ? ', restarting it' : ''}`,
      );
      // Only one that was working: a failing start is retried by the next PDF.
      if (up) restart();
    });
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (server === child && Date.now() < deadline) {
      try {
        await call(INFO_REQUEST, 1_000);
        up = true;
        return;
      } catch {
        await sleep(500);
      }
    }
    if (server === child) {
      server = undefined;
      kill(child);
    }
    throw new JobError('PDF_CONVERSION_FAILED', 'unoserver did not start.');
  }

  async function convertOne(docx: Buffer): Promise<Buffer | JobError> {
    try {
      if (!ready) restart();
      await ready;
      // unoserver's own timeout fires first; this one covers a hung server.
      const pdf = parseConvertResponse(
        await call(convertRequest(docx), timeoutMs + 5_000),
      );
      return isCompletePdf(pdf)
        ? pdf
        : new JobError(
            'PDF_CONVERSION_FAILED',
            'LibreOffice produced no valid PDF.',
          );
    } catch (cause) {
      if (cause instanceof JobError) return cause;
      const timedOut = (cause as Error).name === 'TimeoutError';
      // Its exit starts a new one.
      if (timedOut && server) kill(server);
      return timedOut
        ? new JobError(
            'PDF_CONVERSION_TIMEOUT',
            'LibreOffice timed out.',
            undefined,
            { cause },
          )
        : new JobError(
            'PDF_CONVERSION_FAILED',
            'LibreOffice failed.',
            undefined,
            { cause },
          );
    }
  }

  return {
    async convert(docs) {
      const pdfs: (Buffer | JobError)[] = [];
      for (const docx of docs) pdfs.push(await convertOne(docx));
      return pdfs;
    },
    async dispose() {
      disposed = true;
      const child = server;
      server = undefined;
      if (child) kill(child);
      await rm(root, { recursive: true, force: true });
    },
  };
}
