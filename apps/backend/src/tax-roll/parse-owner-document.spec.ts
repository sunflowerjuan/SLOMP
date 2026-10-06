import { describe, expect, it } from 'vitest';
import { parseOwnerDocument } from './parse-owner-document.js';

describe('parseOwnerDocument', () => {
  describe('a CCNIT with an explicit classification', () => {
    it.each([
      ['CC 40587912', 'CC', '40587912'],
      ['C.C. 40.587.912', 'CC', '40.587.912'],
      ['cc40587912', 'CC', '40587912'],
      ['Cédula de ciudadanía 40587912', 'CC', '40587912'],
      ['CE 456789', 'CE', '456789'],
      ['C.E: 456789', 'CE', '456789'],
      ['Cédula de extranjería 456789', 'CE', '456789'],
      ['NIT 900123456-1', 'NIT', '900123456-1'],
      ['NIT: 900.123.456-1', 'NIT', '900.123.456-1'],
      ['TI 1002345678', 'TI', '1002345678'],
      ['RC 1002345678', 'RC', '1002345678'],
      ['TE 123456', 'TE', '123456'],
      ['PA AB123456', 'PA', 'AB123456'],
      ['PASAPORTE AB123456', 'PA', 'AB123456'],
      ['TDE AB123456', 'TDE', 'AB123456'],
      ['PPT 5123456', 'PPT', '5123456'],
      ['PEP 987654321', 'PEP', '987654321'],
      ['NUIP 1052345678', 'NUIP', '1052345678'],
    ] as const)('%s -> %s %s', (ccnit, type, documentId) => {
      expect(parseOwnerDocument(ccnit)).toEqual({
        documentId,
        documentType: type,
        unrecognizedLabel: false,
      });
    });

    it('keeps the leading-zero padding of the number', () => {
      expect(parseOwnerDocument('CC 00040587912').documentId).toBe(
        '00040587912',
      );
    });

    it('returns an empty number when the cell only has the label', () => {
      expect(parseOwnerDocument('CC').documentId).toBe('');
    });
  });

  describe('a CCNIT with no classification (the type stays NULL)', () => {
    it.each([
      '40587912',
      '00040587912',
      '1052345678',
      // Shapes that "look like" a NIT or a company are NOT classified: the
      // client ruled out deducing the type.
      '900123456',
      '900123456-1',
      '40.587.912',
    ])('%s -> no type, not flagged', (ccnit) => {
      expect(parseOwnerDocument(ccnit)).toEqual({
        documentId: ccnit,
        documentType: null,
        unrecognizedLabel: false,
      });
    });
  });

  describe('text in front of the number that is not a known classification', () => {
    it.each([
      // A bare "Cédula" could be a CC or a CE: not guessed.
      'CEDULA 40587912',
      'DNI 40587912',
      'XX-40587912',
      // A label only counts as a whole word: "CEBALLOS" is not a CE.
      'CEBALLOS 123',
    ])('%s -> no type, flagged, number kept as-is', (ccnit) => {
      expect(parseOwnerDocument(ccnit)).toEqual({
        documentId: ccnit,
        documentType: null,
        unrecognizedLabel: true,
      });
    });
  });
});
