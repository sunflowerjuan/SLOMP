import type { Readable } from 'node:stream';
import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';

// The few Storage operations the backend needs to coordinate the PDF service
// (same shape as apps/pdf-function/src/storage.ts), so the job logic can be
// tested against fakes. Paths are "<container>/<blob name>", as they travel
// in the queue messages.

export interface ResultMessage {
  text: string;
  delete(): Promise<void>;
}

export interface PdfStorage {
  /** Creates the queues and containers; Azure provisions them with Bicep, Azurite starts empty. */
  ensureCreated(): Promise<void>;
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  /** null when the blob doesn't exist. */
  openRead(path: string): Promise<Readable | null>;
  deletePrefix(prefix: string): Promise<void>;
  sendWork(text: string): Promise<void>;
  receiveResults(max: number): Promise<ResultMessage[]>;
}

export interface PdfStorageNames {
  workQueue: string;
  resultsQueue: string;
  jobsContainer: string;
  templatesContainer: string;
}

// A result being applied stays hidden this long; if the backend dies while
// applying it, it comes back after that.
const RESULT_VISIBILITY_SECONDS = 60;
const MAX_RECEIVE = 32;

function split(path: string): { container: string; name: string } {
  const slash = path.indexOf('/');
  return { container: path.slice(0, slash), name: path.slice(slash + 1) };
}

export function connectPdfStorage(
  connectionString: string,
  names: PdfStorageNames,
): PdfStorage {
  // ponytail: connection string only; managed identity comes with the hosting
  // decision (SL-111).
  const queues = QueueServiceClient.fromConnectionString(connectionString);
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const work = queues.getQueueClient(names.workQueue);
  const results = queues.getQueueClient(names.resultsQueue);
  const blockBlob = (path: string) => {
    const { container, name } = split(path);
    return blobService.getContainerClient(container).getBlockBlobClient(name);
  };

  return {
    async ensureCreated() {
      await Promise.all([
        work.createIfNotExists(),
        results.createIfNotExists(),
        ...[names.jobsContainer, names.templatesContainer].map((name) =>
          blobService.getContainerClient(name).createIfNotExists(),
        ),
      ]);
    },
    async upload(path, data, contentType) {
      await blockBlob(path).uploadData(data, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
    },
    async openRead(path) {
      try {
        const response = await blockBlob(path).download();
        return response.readableStreamBody as Readable;
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) return null;
        throw error;
      }
    },
    async deletePrefix(prefix) {
      const { container, name } = split(prefix);
      const client = blobService.getContainerClient(container);
      for await (const item of client.listBlobsFlat({ prefix: name })) {
        await client.deleteBlob(item.name);
      }
    },
    async sendWork(text) {
      // Plain JSON text, not base64: the PDF service reads it as is.
      await work.sendMessage(text);
    },
    async receiveResults(max) {
      const response = await results.receiveMessages({
        numberOfMessages: Math.min(max, MAX_RECEIVE),
        visibilityTimeout: RESULT_VISIBILITY_SECONDS,
      });
      return response.receivedMessageItems.map((item) => ({
        text: item.messageText,
        delete: async () => {
          await results.deleteMessage(item.messageId, item.popReceipt);
        },
      }));
    },
  };
}
