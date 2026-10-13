import type { Readable } from 'node:stream';
import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';
import type { Config } from './config.ts';
import { JobError } from './errors.ts';

// The few Storage operations the service needs, so the worker and the HTTP
// handler can be tested against in-memory fakes instead of Azure/Azurite.

export interface QueueMessage {
  messageId: string;
  popReceipt: string;
  dequeueCount: number;
  text: string;
}

export interface Queue {
  receive(max: number, visibilitySeconds: number): Promise<QueueMessage[]>;
  delete(message: QueueMessage): Promise<void>;
  send(text: string): Promise<void>;
}

/** Paths are "<container>/<blob name>", as they travel in the messages. */
export interface BlobStore {
  /** null when the blob doesn't exist. */
  download(path: string): Promise<Buffer | null>;
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  uploadStream(
    path: string,
    stream: Readable,
    contentType: string,
  ): Promise<void>;
  openRead(path: string): Promise<Readable>;
  list(prefix: string): Promise<string[]>;
}

export interface Storage {
  work: Queue;
  results: Queue;
  poison: Queue;
  blobs: BlobStore;
}

// Azure's per-call receive limit.
const MAX_RECEIVE = 32;

export async function connectAzureStorage(config: Config): Promise<Storage> {
  const connection = config.storageConnectionString!;
  // ponytail: connection string only; managed identity (DefaultAzureCredential)
  // comes with the hosting decision (SL-111).
  const queues = QueueServiceClient.fromConnectionString(connection);
  const blobService = BlobServiceClient.fromConnectionString(connection);
  const allowedContainers = new Set([
    config.jobsContainer,
    config.templatesContainer,
  ]);

  const queue = (name: string): Queue => {
    const client = queues.getQueueClient(name);
    return {
      async receive(max, visibilitySeconds) {
        const response = await client.receiveMessages({
          numberOfMessages: Math.min(max, MAX_RECEIVE),
          visibilityTimeout: visibilitySeconds,
        });
        return response.receivedMessageItems.map((item) => ({
          messageId: item.messageId,
          popReceipt: item.popReceipt,
          dequeueCount: item.dequeueCount,
          text: item.messageText,
        }));
      },
      async delete(message) {
        await client.deleteMessage(message.messageId, message.popReceipt);
      },
      async send(text) {
        // Plain JSON text, not base64: there is no Functions runtime decoding it.
        await client.sendMessage(text);
      },
    };
  };

  // Messages name the container as the first path segment; anything outside
  // the two known containers is refused instead of reaching other data.
  const blob = (path: string) => {
    const slash = path.indexOf('/');
    const container = path.slice(0, slash);
    if (slash <= 0 || !allowedContainers.has(container)) {
      throw new JobError(
        'INVALID_MESSAGE',
        'Blob path outside the allowed containers.',
        {
          path,
        },
      );
    }
    return { container, name: path.slice(slash + 1) };
  };
  const blockBlob = (path: string) => {
    const { container, name } = blob(path);
    return blobService.getContainerClient(container).getBlockBlobClient(name);
  };

  const blobs: BlobStore = {
    async download(path) {
      try {
        return await blockBlob(path).downloadToBuffer();
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 404) return null;
        throw error;
      }
    },
    async upload(path, data, contentType) {
      await blockBlob(path).uploadData(data, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
    },
    async uploadStream(path, stream, contentType) {
      await blockBlob(path).uploadStream(stream, 4 * 1024 * 1024, 4, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
    },
    async openRead(path) {
      const response = await blockBlob(path).download();
      return response.readableStreamBody as Readable;
    },
    async list(prefix) {
      const { container, name } = blob(prefix);
      const paths: string[] = [];
      for await (const item of blobService
        .getContainerClient(container)
        .listBlobsFlat({ prefix: name })) {
        paths.push(`${container}/${item.name}`);
      }
      return paths;
    },
  };

  // Azure provisions these with Bicep; Azurite starts empty.
  await Promise.all([
    ...[config.workQueue, config.resultsQueue, config.poisonQueue].map((name) =>
      queues.getQueueClient(name).createIfNotExists(),
    ),
    ...[...allowedContainers].map((name) =>
      blobService.getContainerClient(name).createIfNotExists(),
    ),
  ]);

  return {
    work: queue(config.workQueue),
    results: queue(config.resultsQueue),
    poison: queue(config.poisonQueue),
    blobs,
  };
}
