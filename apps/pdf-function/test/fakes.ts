import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
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
