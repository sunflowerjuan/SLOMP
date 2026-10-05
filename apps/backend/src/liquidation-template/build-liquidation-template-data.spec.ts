import { describe, expect, it } from 'vitest';
import { NO_OWNER_NAME_PLACEHOLDER } from '../tax-roll/persist-tax-roll.js';
import { buildLiquidationTemplateData } from './build-liquidation-template-data.js';

function detail(concept: string, amount: number) {
  return { concept, amount };
}

const PROPERTY = {
  cadastralCode: '155140001000000010019000000000',
  address: 'LA FORTUNA VDA EL OSO',
  owners: [
    { owner: { name: 'NELLY PINEDA PENA' } },
    { owner: { name: 'MARIA LOPEZ' } },
  ],
};

describe('buildLiquidationTemplateData', () => {
  it('maps property, periods and detail amounts into the template shape', () => {
    const data = buildLiquidationTemplateData('2026-0042', PROPERTY, [
      {
        period: 2024,
        details: [
          detail('Impuesto Predial', 100000),
          detail('Interés Impuesto Predial', 10000),
          detail('C.A.R.', 0),
          detail('Interés C.A.R.', 0),
          detail('Sobretasa Bomberil', 0),
          detail('Interés Sobretasa Bomberil', 0),
        ],
      },
      {
        period: 2025,
        details: [
          detail('Impuesto Predial', 0),
          detail('Interés Impuesto Predial', 0),
          detail('C.A.R.', 20000),
          detail('Interés C.A.R.', 2000),
          detail('Sobretasa Bomberil', 0),
          detail('Interés Sobretasa Bomberil', 0),
        ],
      },
    ]);

    expect(data).toEqual({
      resolutionNumber: '2026-0042',
      cadastralCode: '155140001000000010019000000000',
      propertyName: 'LA FORTUNA VDA EL OSO',
      owners: 'NELLY PINEDA PENA, MARIA LOPEZ',
      startYear: '2024',
      endYear: '2025',
      totalAmount: '$ 132.000',
      capitalAmount: '$ 120.000',
      interestAmount: '$ 12.000',
      rows: [
        {
          year: '2024',
          concept: 'IMPUESTO PREDIAL',
          interest: '$ 10.000',
          capital: '$ 100.000',
        },
        {
          year: '2025',
          concept: 'SOBRETASA AMBIENTAL',
          interest: '$ 2.000',
          capital: '$ 20.000',
        },
      ],
    });
  });

  it('omits a row when its capital concept amount is 0, even if the paired interest is not', () => {
    const data = buildLiquidationTemplateData('2026-0001', PROPERTY, [
      {
        period: 2024,
        details: [
          detail('Impuesto Predial', 0),
          // Unusual, but should not surface a row with no capital charged.
          detail('Interés Impuesto Predial', 5000),
        ],
      },
    ]);

    expect(data.rows).toEqual([]);
    // The stray interest still counts toward the total, it just has no row.
    expect(data.interestAmount).toBe('$ 5.000');
    expect(data.capitalAmount).toBe('$ 0');
  });

  it('filters out the no-name-owner placeholder, rendering a blank instead', () => {
    const data = buildLiquidationTemplateData(
      '2026-0001',
      {
        ...PROPERTY,
        owners: [{ owner: { name: NO_OWNER_NAME_PLACEHOLDER } }],
      },
      [{ period: 2024, details: [detail('Impuesto Predial', 1000)] }],
    );

    expect(data.owners).toBe('');
  });

  it('joins multiple real owners with ", " and skips only the placeholder among them', () => {
    const data = buildLiquidationTemplateData(
      '2026-0001',
      {
        ...PROPERTY,
        owners: [
          { owner: { name: 'Juan Pérez' } },
          { owner: { name: NO_OWNER_NAME_PLACEHOLDER } },
          { owner: { name: 'María Gómez' } },
        ],
      },
      [{ period: 2024, details: [detail('Impuesto Predial', 1000)] }],
    );

    expect(data.owners).toBe('Juan Pérez, María Gómez');
  });

  it('derives startYear/endYear from the min/max of the included periods', () => {
    const data = buildLiquidationTemplateData('2026-0001', PROPERTY, [
      { period: 2023, details: [] },
      { period: 2018, details: [] },
      { period: 2021, details: [] },
    ]);

    expect(data.startYear).toBe('2018');
    expect(data.endYear).toBe('2023');
  });

  it('treats a missing concept detail as 0', () => {
    const data = buildLiquidationTemplateData('2026-0001', PROPERTY, [
      { period: 2024, details: [] },
    ]);

    expect(data.rows).toEqual([]);
    expect(data.totalAmount).toBe('$ 0');
  });
});
