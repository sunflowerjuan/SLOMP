import { describe, expect, it } from 'vitest';
import { maskDocuments } from './mask-documents.js';

describe('maskDocuments', () => {
  it.each([
    ['CC 1234567890', 'CC [DOC]'],
    ['cc 123456', 'cc [DOC]'],
    ['CE: 9876543', 'CE: [DOC]'],
    ['NIT 900123456', 'NIT [DOC]'],
    ['TI No. 10203040', 'TI No. [DOC]'],
    ['PP#12345678', 'PP#[DOC]'],
    ['pagó CC1234567 ayer', 'pagó CC[DOC] ayer'],
    ['CC 111111 y CE 2222222', 'CC [DOC] y CE [DOC]'],
  ])('masks %s', (input, expected) => {
    expect(maskDocuments(input)).toBe(expected);
  });

  it.each([
    // Fewer than 6 or more than 10 digits.
    'CC 12345',
    'CC 12345678901',
    // No document type before the digits: a settlement or a cadastral code.
    'la liquidación 1234567',
    '155140001000200030000',
    // The letters inside a word.
    'ACC 1234567',
  ])('leaves %s as it is', (input) => {
    expect(maskDocuments(input)).toBe(input);
  });
});
