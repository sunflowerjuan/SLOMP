import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  MAX_TEMPLATE_NAME_LENGTH,
  templateFileName,
} from './template-file-name.js';

describe('templateFileName', () => {
  it('keeps the uploaded name when none is chosen', () => {
    expect(templateFileName(undefined, 'Liquidación Páez.docx')).toBe(
      'Liquidación Páez.docx',
    );
  });

  it('adds .docx once and tidies the spaces', () => {
    expect(templateFileName('  Liquidación   2026 ', 'x.docx')).toBe(
      'Liquidación 2026.docx',
    );
    expect(templateFileName('Mandamiento.DOCX', 'x.docx')).toBe(
      'Mandamiento.docx',
    );
  });

  it.each([
    '',
    '   ',
    '.docx',
    'carpeta/plantilla',
    'carpeta\\plantilla',
    'línea\nnueva',
    'a'.repeat(MAX_TEMPLATE_NAME_LENGTH + 1),
  ])('refuses %j', (chosen) => {
    let code: string | undefined;
    try {
      templateFileName(chosen, 'x.docx');
    } catch (error) {
      code = (error as { getResponse(): { code: string } }).getResponse().code;
    }
    expect(code).toBe(ErrorCode.TEMPLATE_FILE_NAME_INVALID);
  });
});
