import { createHash } from 'node:crypto';
import type { TemplateRef } from './contract.ts';
import { JobError } from './errors.ts';
import type { BlobStore } from './storage.ts';

// Templates are cached by content hash: each version is downloaded once and
// a new version (new hash) never serves a stale copy. Every guided-markup
// preview is a new hash (~325 KB), so only the most recently used ones stay
// (~6.5 MB at 20); an evicted template is downloaded and checked again. A Map
// keeps insertion order, so a hit moves its entry to the end.
export function createTemplateCache(blobs: BlobStore, maxEntries = 20) {
  const cache = new Map<string, Buffer>();

  return async function getTemplate(ref: TemplateRef): Promise<Buffer> {
    const cached = cache.get(ref.sha256);
    if (cached) {
      cache.delete(ref.sha256);
      cache.set(ref.sha256, cached);
      return cached;
    }
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
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
    return template;
  };
}

export type GetTemplate = ReturnType<typeof createTemplateCache>;
