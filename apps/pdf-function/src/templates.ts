import { createHash } from 'node:crypto';
import type { TemplateRef } from './contract.ts';
import { JobError } from './errors.ts';
import type { BlobStore } from './storage.ts';

// Templates are cached by content hash: each version is downloaded once and
// a new version (new hash) never serves a stale copy.
export function createTemplateCache(blobs: BlobStore) {
  const cache = new Map<string, Buffer>();

  return async function getTemplate(ref: TemplateRef): Promise<Buffer> {
    const cached = cache.get(ref.sha256);
    if (cached) return cached;
    const template = await blobs.download(ref.blob);
    if (!template) {
      throw new JobError('PDF_TEMPLATE_UNAVAILABLE', 'Template not found.', {
        blob: ref.blob,
      });
    }
    const actual = createHash('sha256').update(template).digest('hex');
    if (actual !== ref.sha256) {
      throw new JobError(
        'PDF_TEMPLATE_UNAVAILABLE',
        'Template hash mismatch.',
        {
          blob: ref.blob,
          expected: ref.sha256,
          actual,
        },
      );
    }
    cache.set(ref.sha256, template);
    return template;
  };
}

export type GetTemplate = ReturnType<typeof createTemplateCache>;
