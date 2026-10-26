import { describe, expect, it } from 'vitest';
import { buildTemplateCatalog } from './template-catalog.js';
import { CATALOGS } from './validate-template-fields.js';

describe('buildTemplateCatalog', () => {
  it('publishes the 14 liquidation fields, required ones first', () => {
    const entries = buildTemplateCatalog('LIQUIDACION');

    expect(entries).toHaveLength(14);
    const firstOptional = entries.findIndex((entry) => !entry.required);
    expect(entries.slice(firstOptional).some((entry) => entry.required)).toBe(
      false,
    );
    expect(entries.slice(0, firstOptional).map((entry) => entry.key)).toEqual([
      'resolutionNumber',
      'cadastralCode',
      'totalAmount',
      'rows',
      'rows.year',
    ]);
  });

  it('publishes the 9 payment order fields, with the inline list as one entry', () => {
    const entries = buildTemplateCatalog('MANDAMIENTO');

    expect(entries).toHaveLength(9);
    expect(entries.find((entry) => entry.key === 'liquidations')?.kind).toBe(
      'INLINE_LIST',
    );
    expect(entries.some((entry) => entry.key.startsWith('liquidations.'))).toBe(
      false,
    );
  });

  it.each(['LIQUIDACION', 'MANDAMIENTO'] as const)(
    'requires everything %s validation requires, plus only rows.year',
    (type) => {
      const required = CATALOGS[type]!.required;
      const published = buildTemplateCatalog(type)
        .filter((entry) => entry.required)
        .map((entry) => entry.key);

      expect(published).toEqual(expect.arrayContaining([...required]));
      expect(published.filter((key) => !required.includes(key))).toEqual(
        type === 'LIQUIDACION' ? ['rows.year'] : [],
      );
    },
  );

  it('returns the lawyer-facing fields of each entry', () => {
    const [first] = buildTemplateCatalog('LIQUIDACION');

    expect(first).toEqual({
      key: 'resolutionNumber',
      label: 'Número de resolución',
      description: expect.any(String),
      required: true,
      kind: 'SCALAR',
    });
  });
});
