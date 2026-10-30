import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { PDFArray, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import PizZip from 'pizzip';
import { JobError } from '../src/errors.ts';
import { minimalDocx } from '../src/minimal-docx.ts';
import type { Slot } from '../src/soffice.ts';
import type {
  BlobStore,
  Queue,
  QueueMessage,
  Storage,
} from '../src/storage.ts';

export class FakeQueue implements Queue {
  messages: QueueMessage[] = [];
  sent: string[] = [];
  receiveRequests: number[] = [];
  private nextId = 0;

  enqueue(body: unknown, dequeueCount = 0): QueueMessage {
    const message = {
      messageId: String(this.nextId++),
      popReceipt: 'receipt',
      dequeueCount,
      text: typeof body === 'string' ? body : JSON.stringify(body),
    };
    this.messages.push(message);
    return message;
  }

  async receive(max: number): Promise<QueueMessage[]> {
    this.receiveRequests.push(max);
    return this.messages
      .splice(0, max)
      .map((m) => ({ ...m, dequeueCount: m.dequeueCount + 1 }));
  }

  async delete(message: QueueMessage): Promise<void> {
    this.deleted.push(message.messageId);
  }
  deleted: string[] = [];

  async send(text: string): Promise<void> {
    this.sent.push(text);
  }

  sentJson(): Record<string, unknown>[] {
    return this.sent.map((text) => JSON.parse(text));
  }
}

export class FakeBlobs implements BlobStore {
  files = new Map<string, Buffer>();
  downloads = 0;

  async download(path: string) {
    this.downloads++;
    return this.files.get(path) ?? null;
  }
  async upload(path: string, data: Buffer) {
    this.files.set(path, data);
  }
  async uploadStream(path: string, stream: Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    this.files.set(path, Buffer.concat(chunks));
  }
  async openRead(path: string) {
    return Readable.from([this.files.get(path)!]);
  }
  async list(prefix: string) {
    return [...this.files.keys()].filter((key) => key.startsWith(prefix));
  }
}

export function fakeStorage() {
  return {
    work: new FakeQueue(),
    results: new FakeQueue(),
    poison: new FakeQueue(),
    blobs: new FakeBlobs(),
  } satisfies Storage;
}

export const FAKE_PDF = Buffer.from('%PDF-1.7 fake %%EOF');

/** A slot whose conversions are scripted per call; records what it received. */
export function fakeSlot(
  convert: (docs: Buffer[]) => (Buffer | JobError)[] = (docs) =>
    docs.map(() => FAKE_PDF),
): Slot & { calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    async convert(docs) {
      calls.push(docs.length);
      return convert(docs);
    },
    async dispose() {},
  };
}

export const conversionError = () =>
  new JobError('PDF_CONVERSION_FAILED', 'LibreOffice produced no valid PDF.');

export function templateFixture() {
  const template = minimalDocx([
    '{resolutionNumber}',
    '{#rows}{year} {capital} {/rows}',
  ]);
  return {
    template,
    sha256: createHash('sha256').update(template).digest('hex'),
  };
}

const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * A template shaped like a Word one: a body section with a header that
 * counts pages ("Página X de Y") and a plain footer.
 */
export function sectionTemplate({
  header = '<w:p><w:r><w:t>Página </w:t></w:r><w:fldSimple w:instr=" PAGE "/><w:r><w:t> de </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "/></w:p>',
  sectExtra = '',
} = {}): Buffer {
  const zip = new PizZip(minimalDocx(['{resolutionNumber}', 'Fin']));
  const document = zip
    .file('word/document.xml')!
    .asText()
    .replace('<w:document ', `<w:document xmlns:r="${REL}" `)
    .replace(
      '</w:body>',
      `<w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:footerReference w:type="default" r:id="rId9"/><w:pgSz w:w="12240" w:h="15840"/>${sectExtra}<w:cols w:space="708"/></w:sectPr></w:body>`,
    );
  zip.file('word/document.xml', document);
  const part = (tag: string, body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:${tag}>`;
  zip.file('word/header1.xml', part('hdr', header));
  zip.file(
    'word/footer1.xml',
    part('ftr', '<w:p><w:r><w:t>Pie</w:t></w:r></w:p>'),
  );
  zip.file(
    'word/_rels/header1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rId9" Type="${REL}/footer" Target="footer1.xml"/></Relationships>`,
  );
  return zip.generate({ type: 'nodebuffer' });
}

/**
 * What LibreOffice exports for a merged batch: the documents' pages one after
 * another, each start marked by a named destination.
 */
export async function mergedPdf(
  pagesPerDocument: number[],
  where: 'Dests' | 'Names' = 'Dests',
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const entries: [string, PDFArray][] = [];
  pagesPerDocument.forEach((pages, i) => {
    for (let p = 0; p < pages; p++) {
      const page = pdf.addPage([100, 100]);
      if (p === 0) {
        entries.push([
          `SlompDoc${String(i + 1).padStart(5, '0')}`,
          pdf.context.obj([page.ref, PDFName.of('XYZ'), null, null, null]),
        ]);
      }
    }
  });
  if (where === 'Dests') {
    pdf.catalog.set(
      PDFName.of('Dests'),
      pdf.context.obj(Object.fromEntries(entries)),
    );
  } else {
    const names = entries.flatMap(([name, dest]) => [PDFString.of(name), dest]);
    pdf.catalog.set(
      PDFName.of('Names'),
      pdf.context.obj({ Dests: pdf.context.obj({ Names: names }) }),
    );
  }
  return Buffer.from(await pdf.save());
}
