import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PdfServiceClient, pdfConfig } from './pdf-service.client.js';

// The reference every PDF message carries is the municipality's active
// template: it is read from the database, never from a fixed path.
function build(active: { blobPath: string; sha256: string } | null) {
  const prisma = {
    template: { findFirst: vi.fn().mockResolvedValue(active) },
  };
  return { client: new PdfServiceClient(prisma as never), prisma };
}

describe('PdfServiceClient.liquidationTemplate', () => {
  it('returns the Blob path and hash of the active liquidation template', async () => {
    const { client, prisma } = build({
      blobPath: 'templates/paez/liquidacion/3.docx',
      sha256: 'b'.repeat(64),
    });

    await expect(client.liquidationTemplate(1)).resolves.toEqual({
      blob: 'templates/paez/liquidacion/3.docx',
      sha256: 'b'.repeat(64),
    });
    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: { municipalityId: 1, documentType: 'LIQUIDACION', isActive: true },
      select: { blobPath: true, sha256: true },
    });
  });

  it('looks up the template of the requested document type', async () => {
    const { client, prisma } = build({
      blobPath: 'templates/paez/mandamiento/1.docx',
      sha256: 'd'.repeat(64),
    });

    await expect(client.activeTemplate(1, 'MANDAMIENTO')).resolves.toEqual({
      blob: 'templates/paez/mandamiento/1.docx',
      sha256: 'd'.repeat(64),
    });
    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: { municipalityId: 1, documentType: 'MANDAMIENTO', isActive: true },
      select: { blobPath: true, sha256: true },
    });
  });

  it('asks only for the template of the municipality it was called with', async () => {
    const { client, prisma } = build(null);

    await client.liquidationTemplate(2).catch(() => undefined);

    expect(prisma.template.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ municipalityId: 2 }),
      }),
    );
  });

  it('answers 503 PDF_TEMPLATE_UNAVAILABLE when the municipality has no active template', async () => {
    const { client } = build(null);

    const error = (await client.liquidationTemplate(1).catch((e) => e)) as {
      getStatus(): number;
      getResponse(): { code: string };
    };

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse().code).toBe(ErrorCode.PDF_TEMPLATE_UNAVAILABLE);
  });

  it('does not need Storage: the file is already in Blob', async () => {
    const { client } = build({
      blobPath: 'templates/x/liquidacion/1.docx',
      sha256: 'c'.repeat(64),
    });

    expect(client.storageConfigured).toBe(false);
    await expect(client.liquidationTemplate(1)).resolves.toBeDefined();
  });
});

describe('pdfConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['http://pdf:8080', 'http://pdf:8080'],
    ['http://pdf:8080/', 'http://pdf:8080'],
    ['http://pdf:8080///', 'http://pdf:8080'],
    ['http://pdf:8080/api/', 'http://pdf:8080/api'],
    ['/', undefined],
    ['', undefined],
  ])('reads the service URL "%s" as %s', (value, serviceUrl) => {
    vi.stubEnv('PDF_SERVICE_URL', value);
    expect(pdfConfig().serviceUrl).toBe(serviceUrl);
  });

  // A run of slashes followed by another character is what made /\/+$/
  // quadratic (seconds for 100 000 slashes).
  it('handles 100 000 slashes in linear time', () => {
    const slashes = '/'.repeat(100_000);
    const started = performance.now();
    vi.stubEnv('PDF_SERVICE_URL', `http://pdf${slashes}`);
    expect(pdfConfig().serviceUrl).toBe('http://pdf');
    vi.stubEnv('PDF_SERVICE_URL', `http://pdf${slashes}x`);
    expect(pdfConfig().serviceUrl).toBe(`http://pdf${slashes}x`);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
