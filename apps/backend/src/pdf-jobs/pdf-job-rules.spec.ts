import { PdfDocumentType, ResolutionKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  bulkFolder,
  bulkZipFileName,
  counterAfterRevert,
  paymentOrderFileName,
  parsePdfResult,
  splitIntoBatches,
} from './pdf-job-rules.js';

describe('pdf job rules', () => {
  it('splits documents into batches of the configured size', () => {
    expect(splitIntoBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitIntoBatches([], 10)).toEqual([]);
  });

  it('names the ZIP folder of each kind with the prescription cutoff year', () => {
    expect(bulkFolder(ResolutionKind.PRESCRIPTION_RISK, 2026)).toBe(
      'Liquidaciones antes de 2022',
    );
    expect(bulkFolder(ResolutionKind.NORMAL, 2026)).toBe(
      'Liquidaciones 2022 en adelante',
    );
  });

  it('puts every payment order in one folder, named with the MP prefix', () => {
    expect(paymentOrderFileName('2026-0007')).toBe(
      'Mandamientos de pago/MP-2026-0007.pdf',
    );
  });

  it('names the ZIP after the document type, and the liquidations ZIP after the kind', () => {
    expect(bulkZipFileName(PdfDocumentType.MANDAMIENTO, null)).toBe(
      'mandamientos-de-pago.zip',
    );
    expect(
      bulkZipFileName(
        PdfDocumentType.LIQUIDACION,
        ResolutionKind.PRESCRIPTION_RISK,
      ),
    ).toBe('liquidaciones-riesgo-prescripcion.zip');
    expect(
      bulkZipFileName(PdfDocumentType.LIQUIDACION, ResolutionKind.NORMAL),
    ).toBe('liquidaciones-cobro-normal.zip');
  });

  it('hands the range back only while nobody took numbers after the job', () => {
    // Job reserved 42..51 (counter was 41).
    expect(counterAfterRevert(51, 42, 51)).toBe(41);
    expect(counterAfterRevert(52, 42, 51)).toBeNull();
  });

  it('accepts the results of the contract and drops anything else', () => {
    const done = {
      schemaVersion: 1,
      type: 'batch-result',
      jobId: 'j',
      batchIndex: 3,
      status: 'DONE',
      documentCount: 10,
      attempt: 1,
    };
    expect(parsePdfResult(JSON.stringify(done))).toEqual(done);
    expect(
      parsePdfResult(
        JSON.stringify({
          schemaVersion: 1,
          type: 'zip-result',
          jobId: 'j',
          status: 'DONE',
          sizeBytes: 1,
        }),
      ),
    ).not.toBeNull();
    expect(parsePdfResult('not json')).toBeNull();
    expect(
      parsePdfResult(JSON.stringify({ ...done, batchIndex: undefined })),
    ).toBeNull();
    expect(
      parsePdfResult(JSON.stringify({ ...done, schemaVersion: 2 })),
    ).toBeNull();
  });
});
