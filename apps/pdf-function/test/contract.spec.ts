import { describe, expect, it } from 'vitest';
import {
  parseBatchInput,
  parseRenderRequest,
  parseWorkMessage,
} from '../src/contract.ts';

const sha256 = 'a'.repeat(64);
const renderBatch = {
  schemaVersion: 1,
  type: 'render-batch',
  jobId: 'job-1',
  municipalityId: 1,
  documentType: 'LIQUIDACION',
  batchIndex: 0,
  inputBlob: 'pdf-jobs/job-1/input/batch-000.json',
  template: { blob: 'templates/paez/liquidacion/1.docx', sha256 },
  outputPrefix: 'pdf-jobs/job-1/pdf/',
};

const invalid = (fn: () => unknown) =>
  expect(fn).toThrow(expect.objectContaining({ code: 'INVALID_MESSAGE' }));

describe('parseWorkMessage', () => {
  it('accepts the render-batch and assemble-zip messages of the contract', () => {
    expect(parseWorkMessage(renderBatch)).toEqual(renderBatch);
    const zip = {
      schemaVersion: 1,
      type: 'assemble-zip',
      jobId: 'job-1',
      sourcePrefix: 'pdf-jobs/job-1/pdf/',
      zipBlob: 'pdf-jobs/job-1/result.zip',
      expectedFiles: 12,
    };
    expect(parseWorkMessage(zip)).toEqual(zip);
  });

  it('rejects unknown versions, types and missing fields', () => {
    invalid(() => parseWorkMessage({ ...renderBatch, schemaVersion: 2 }));
    invalid(() => parseWorkMessage({ ...renderBatch, type: 'other' }));
    invalid(() => parseWorkMessage({ ...renderBatch, jobId: '' }));
    invalid(() => parseWorkMessage({ ...renderBatch, documentType: 'OTHER' }));
    invalid(() =>
      parseWorkMessage({
        ...renderBatch,
        template: { blob: 'x/y', sha256: 'abc' },
      }),
    );
    invalid(() => parseWorkMessage('text'));
  });

  it('rejects paths that could escape the job folder', () => {
    invalid(() =>
      parseWorkMessage({
        ...renderBatch,
        outputPrefix: 'pdf-jobs/../templates/',
      }),
    );
    invalid(() =>
      parseWorkMessage({ ...renderBatch, inputBlob: '/etc/passwd' }),
    );
    invalid(() =>
      parseWorkMessage({ ...renderBatch, outputPrefix: 'pdf-jobs/job-1/pdf' }),
    );
  });
});

describe('parseBatchInput', () => {
  it('requires unique relative .pdf file names and object data', () => {
    const doc = { fileName: 'Carpeta/2026-0001.pdf', data: { a: 1 } };
    expect(parseBatchInput({ documents: [doc] }).documents).toEqual([doc]);
    invalid(() => parseBatchInput({ documents: [] }));
    invalid(() => parseBatchInput({ documents: [doc, doc] }));
    invalid(() =>
      parseBatchInput({ documents: [{ ...doc, fileName: '../x.pdf' }] }),
    );
    invalid(() =>
      parseBatchInput({ documents: [{ ...doc, fileName: 'x.docx' }] }),
    );
    invalid(() => parseBatchInput({ documents: [{ ...doc, data: [] }] }));
  });
});

describe('parseRenderRequest', () => {
  it('accepts the /render body and rejects a malformed one', () => {
    const body = {
      schemaVersion: 1,
      documentType: 'LIQUIDACION',
      template: renderBatch.template,
      data: { resolutionNumber: '2026-0042' },
    };
    expect(parseRenderRequest(body)).toEqual(body);
    invalid(() => parseRenderRequest({ ...body, data: 'x' }));
  });
});
