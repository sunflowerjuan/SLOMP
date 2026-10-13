import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { CodedError } from '../common/errors/coded-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { extractTemplateFields } from './extract-template-fields.js';
import { buildDocx, LIQUIDATION_PARAGRAPHS } from './test-docx.js';
import {
  LIQUIDATION_FIELDS,
  validateTemplateFields,
} from './validate-template-fields.js';

const LOOPS = Object.keys(LIQUIDATION_FIELDS.loops);

function codeOf(action: () => unknown): CodedError {
  try {
    action();
  } catch (error) {
    if (error instanceof CodedError) return error;
    throw error;
  }
  throw new Error('expected a CodedError, nothing was thrown');
}

describe('extractTemplateFields', () => {
  it('lists every marker once, with loop fields under their loop', () => {
    const fields = extractTemplateFields(
      buildDocx(LIQUIDATION_PARAGRAPHS),
      LOOPS,
    );
    expect([...fields].sort()).toEqual(
      [
        'resolutionNumber',
        'cadastralCode',
        'propertyName',
        'owners',
        'startYear',
        'endYear',
        'totalAmount',
        'capitalAmount',
        'interestAmount',
        'rows',
        'rows.year',
        'rows.concept',
        'rows.interest',
        'rows.capital',
      ].sort(),
    );
  });

  it('finds a marker that Word split across several runs', () => {
    const docx = buildDocx([
      ['RESOLUCION ', '{resolution', 'Number}'],
      ['{#rows}{ye', 'ar}{/rows}'],
    ]);
    expect(extractTemplateFields(docx, LOOPS)).toEqual(
      expect.arrayContaining(['resolutionNumber', 'rows', 'rows.year']),
    );
  });

  it('is accepted by the catalog when it uses the official markers', () => {
    const fields = extractTemplateFields(
      buildDocx(LIQUIDATION_PARAGRAPHS),
      LOOPS,
    );
    expect(validateTemplateFields('LIQUIDACION', fields)).toEqual({
      missing: [],
      unknown: [],
    });
  });

  it('rejects a loop that is never closed and says which one', () => {
    const error = codeOf(() =>
      extractTemplateFields(buildDocx(['{#rows}{year}']), LOOPS),
    );
    expect(error.code).toBe(ErrorCode.TEMPLATE_MARKERS_MALFORMED);
    expect(error.details).toEqual({
      problems: [{ marker: 'rows', problem: 'unclosed_loop' }],
    });
  });

  it('rejects a marker whose brace is never closed', () => {
    const error = codeOf(() =>
      extractTemplateFields(buildDocx(['total {totalAmount']), LOOPS),
    );
    expect(error.code).toBe(ErrorCode.TEMPLATE_MARKERS_MALFORMED);
    expect(error.details).toEqual({
      problems: [{ marker: 'totalAmount', problem: 'unclosed_tag' }],
    });
  });

  it('rejects a file that is not a zip', () => {
    const error = codeOf(() =>
      extractTemplateFields(Buffer.from('this is not a docx'), LOOPS),
    );
    expect(error.code).toBe(ErrorCode.TEMPLATE_NOT_DOCX);
  });

  it('rejects a zip that has no Word document inside', () => {
    const zip = new PizZip();
    zip.file('hello.txt', 'hi');
    const error = codeOf(() =>
      extractTemplateFields(zip.generate({ type: 'nodebuffer' }), LOOPS),
    );
    expect(error.code).toBe(ErrorCode.TEMPLATE_NOT_DOCX);
  });

  it('rejects a document with a VBA macro project', () => {
    const docx = buildDocx(LIQUIDATION_PARAGRAPHS, {
      'word/vbaProject.bin': 'macro',
    });
    const error = codeOf(() => extractTemplateFields(docx, LOOPS));
    expect(error.code).toBe(ErrorCode.TEMPLATE_HAS_MACROS);
  });

  it('rejects a zip that expands past the limit before unpacking it all', () => {
    const docx = buildDocx(LIQUIDATION_PARAGRAPHS, {
      'word/media/huge.bin': 'a'.repeat(5000),
    });
    const error = codeOf(() =>
      extractTemplateFields(docx, LOOPS, { maxUncompressedBytes: 1000 }),
    );
    expect(error.code).toBe(ErrorCode.TEMPLATE_NOT_DOCX);
  });
});

// The official template is client material and is not in git: this runs on
// machines that have it and is skipped everywhere else.
const REAL_TEMPLATE = resolve(process.cwd(), 'templates/liquidacion-paez.docx');
describe.skipIf(!existsSync(REAL_TEMPLATE))(
  'the official Páez template',
  () => {
    it('passes the liquidation catalog', () => {
      const fields = extractTemplateFields(readFileSync(REAL_TEMPLATE), LOOPS);
      expect(validateTemplateFields('LIQUIDACION', fields)).toEqual({
        missing: [],
        unknown: [],
      });
    });
  },
);
