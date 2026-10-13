import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertDocxBatchToPdf } from './convert-docx-batch-to-pdf.js';
import { convertDocxToPdf, PdfConversionError } from './convert-docx-to-pdf.js';
import { ErrorCode } from '../common/errors/error-codes.js';

const VALID_PDF = Buffer.from('%PDF-1.7\nbody\n%%EOF\n');
const docx = Buffer.from('PK-docx');

function pdfResponse(body: Buffer = VALID_PDF, status = 200) {
  return new Response(new Uint8Array(body), { status });
}

describe('PDF conversion through the PDF service (PDF_SERVICE_URL)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    process.env.PDF_SERVICE_URL = 'http://pdf:3001/';
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete process.env.PDF_SERVICE_URL;
    delete process.env.PDF_SERVICE_CONCURRENCY;
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('posts the docx to /convert and returns the PDF', async () => {
    fetchMock.mockResolvedValue(pdfResponse());

    const pdf = await convertDocxToPdf(docx);

    expect(pdf.equals(VALID_PDF)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://pdf:3001/convert');
    expect(init?.method).toBe('POST');
  });

  it('maps a 504 from the service to PDF_CONVERSION_TIMEOUT', async () => {
    fetchMock.mockResolvedValue(pdfResponse(Buffer.from('{}'), 504));

    await expect(convertDocxToPdf(docx)).rejects.toMatchObject({
      code: ErrorCode.PDF_CONVERSION_TIMEOUT,
    });
  });

  it.each([400, 500, 503])(
    'maps HTTP %i from the service to PDF_CONVERSION_FAILED',
    async (status) => {
      fetchMock.mockResolvedValue(pdfResponse(Buffer.from('{}'), status));

      await expect(convertDocxToPdf(docx)).rejects.toMatchObject({
        code: ErrorCode.PDF_CONVERSION_FAILED,
      });
    },
  );

  it('maps an unreachable service to PDF_CONVERSION_FAILED', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(convertDocxToPdf(docx)).rejects.toBeInstanceOf(
      PdfConversionError,
    );
  });

  it('maps a client-side timeout to PDF_CONVERSION_TIMEOUT', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    );

    await expect(convertDocxToPdf(docx)).rejects.toMatchObject({
      code: ErrorCode.PDF_CONVERSION_TIMEOUT,
    });
  });

  it('rejects a response that is not a complete PDF', async () => {
    fetchMock.mockResolvedValue(pdfResponse(Buffer.from('%PDF-1.7 truncated')));

    await expect(convertDocxToPdf(docx)).rejects.toMatchObject({
      code: ErrorCode.PDF_CONVERSION_FAILED,
    });
  });

  it('never has more requests in flight than PDF_SERVICE_CONCURRENCY', async () => {
    process.env.PDF_SERVICE_CONCURRENCY = '2';
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return pdfResponse();
    });

    await Promise.all(Array.from({ length: 7 }, () => convertDocxToPdf(docx)));

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(peak).toBe(2);
  });

  it('converts a batch one request per document, keeping per-document errors', async () => {
    fetchMock
      .mockResolvedValueOnce(pdfResponse())
      .mockResolvedValueOnce(pdfResponse(Buffer.from('{}'), 500));

    const results = await convertDocxBatchToPdf(
      [
        { name: 'a', docx },
        { name: 'b', docx },
      ],
      '/unused',
      '/unused',
    );

    expect(results.get('a')?.pdf?.equals(VALID_PDF)).toBe(true);
    expect(results.get('b')?.error?.code).toBe(ErrorCode.PDF_CONVERSION_FAILED);
  });
});
