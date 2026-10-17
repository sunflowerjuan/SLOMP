import { describe, expect, it } from 'vitest';
import { NO_OWNER_NAME_PLACEHOLDER } from '../tax-roll/persist-tax-roll.js';
import { buildPaymentOrderTemplateData } from './build-payment-order-template-data.js';

function settlement(
  period: number,
  resolutionNumber: string,
  capital: { predial?: number; car?: number; bomberil?: number },
) {
  return {
    period,
    resolutionNumber,
    details: [
      { concept: 'Impuesto Predial', amount: capital.predial ?? 0 },
      { concept: 'Interés Impuesto Predial', amount: 999 },
      { concept: 'C.A.R.', amount: capital.car ?? 0 },
      { concept: 'Interés C.A.R.', amount: 999 },
      { concept: 'Sobretasa Bomberil', amount: capital.bomberil ?? 0 },
      { concept: 'Interés Sobretasa Bomberil', amount: 999 },
    ],
  };
}

const PROPERTY = {
  cadastralCode: '155140001000000010019000000000',
  address: 'LA FORTUNA VDA EL OSO',
  owners: [{ owner: { name: 'NELLY PINEDA PENA' } }],
};

// 2026-10-17 03:00 UTC is still the 16th in Colombia (UTC-5).
const ISSUED_AT = new Date('2026-10-17T03:00:00Z');

describe('buildPaymentOrderTemplateData', () => {
  it('charges only the capital of every period, never the interest', () => {
    const data = buildPaymentOrderTemplateData(
      '2026-0007',
      ISSUED_AT,
      PROPERTY,
      [
        settlement(2022, '2026-0042', { predial: 100000, car: 20000 }),
        settlement(2024, '2026-0042', { predial: 50000, bomberil: 5000 }),
      ],
    );

    expect(data.capitalAmount).toBe('$ 175.000');
    expect(data).not.toHaveProperty('interestAmount');
    expect(data).not.toHaveProperty('rows');
  });

  it('maps the property and the period range and dates the order in Colombia time', () => {
    const data = buildPaymentOrderTemplateData(
      '2026-0007',
      ISSUED_AT,
      PROPERTY,
      [
        settlement(2025, '2026-0042', { predial: 1 }),
        settlement(2021, '2026-0042', { predial: 1 }),
      ],
    );

    expect(data).toMatchObject({
      paymentOrderNumber: '2026-0007',
      issueDate: '16/10/2026',
      cadastralCode: '155140001000000010019000000000',
      propertyName: 'LA FORTUNA VDA EL OSO',
      owners: 'NELLY PINEDA PENA',
      startYear: '2021',
      endYear: '2025',
    });
  });

  it('lists each liquidation once, sorted, joined with commas and a final "y"', () => {
    const data = buildPaymentOrderTemplateData(
      '2026-0007',
      ISSUED_AT,
      PROPERTY,
      [
        settlement(2021, '2026-0051', { predial: 1 }),
        settlement(2022, '2026-0042', { predial: 1 }),
        settlement(2023, '2026-0042', { predial: 1 }),
        settlement(2024, '2026-0060', { predial: 1 }),
      ],
    );

    expect(data.liquidations).toEqual([
      { number: '2026-0042', separator: ', ' },
      { number: '2026-0051', separator: ' y ' },
      { number: '2026-0060', separator: '' },
    ]);
  });

  it('has no separator for a single liquidation and two are joined by "y"', () => {
    const one = buildPaymentOrderTemplateData(
      '2026-0007',
      ISSUED_AT,
      PROPERTY,
      [settlement(2021, '2026-0042', { predial: 1 })],
    );
    const two = buildPaymentOrderTemplateData(
      '2026-0007',
      ISSUED_AT,
      PROPERTY,
      [
        settlement(2021, '2026-0042', { predial: 1 }),
        settlement(2022, '2026-0050', { predial: 1 }),
      ],
    );

    expect(one.liquidations).toEqual([{ number: '2026-0042', separator: '' }]);
    expect(two.liquidations.map((l) => l.separator)).toEqual([' y ', '']);
  });

  it('leaves the owners empty when the only owner is the placeholder', () => {
    const data = buildPaymentOrderTemplateData(
      '2026-0007',
      ISSUED_AT,
      { ...PROPERTY, owners: [{ owner: { name: NO_OWNER_NAME_PLACEHOLDER } }] },
      [settlement(2021, '2026-0042', { predial: 1 })],
    );

    expect(data.owners).toBe('');
  });
});
