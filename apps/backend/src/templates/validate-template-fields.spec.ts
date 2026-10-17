import { describe, expect, it } from 'vitest';
import { buildLiquidationTemplateData } from '../liquidation-template/build-liquidation-template-data.js';
import { buildPaymentOrderTemplateData } from '../payment-orders/build-payment-order-template-data.js';
import {
  LIQUIDATION_FIELDS,
  PAYMENT_ORDER_FIELDS,
  validateTemplateFields,
} from './validate-template-fields.js';

const ALL_FIELDS = [
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
];

describe('validateTemplateFields (LIQUIDACION)', () => {
  it('accepts a template that uses every catalog field', () => {
    expect(validateTemplateFields('LIQUIDACION', ALL_FIELDS)).toEqual({
      missing: [],
      unknown: [],
    });
  });

  it('accepts a template that only uses the required fields', () => {
    const required = [
      'resolutionNumber',
      'cadastralCode',
      'totalAmount',
      'rows',
      'rows.year',
    ];
    expect(validateTemplateFields('LIQUIDACION', required)).toEqual({
      missing: [],
      unknown: [],
    });
  });

  it('reports each required field the template lacks', () => {
    const result = validateTemplateFields('LIQUIDACION', ['cadastralCode']);
    expect(result.missing).toEqual(['resolutionNumber', 'totalAmount', 'rows']);
  });

  it('reports a marker that is not in the catalog, keeping the typo visible', () => {
    const result = validateTemplateFields('LIQUIDACION', [
      ...ALL_FIELDS,
      'resolutionNumbr',
      'rows.amount',
    ]);
    expect(result.unknown).toEqual(['resolutionNumbr', 'rows.amount']);
    expect(result.missing).toEqual([]);
  });

  it('does not accept a loop field used outside its loop', () => {
    const result = validateTemplateFields('LIQUIDACION', [
      ...ALL_FIELDS.filter((field) => !field.startsWith('rows.')),
      'year',
    ]);
    expect(result.unknown).toEqual(['year']);
  });

  it('exposes the catalog so the frontend text and the check cannot drift', () => {
    expect(LIQUIDATION_FIELDS.scalars).toContain('resolutionNumber');
    expect(LIQUIDATION_FIELDS.loops.rows).toEqual([
      'year',
      'concept',
      'interest',
      'capital',
    ]);
  });
});

describe('the LIQUIDACION catalog', () => {
  it('covers exactly the data the backend builds for a liquidation', () => {
    const { rows, ...scalars } = buildLiquidationTemplateData(
      '2026-0001',
      {
        cadastralCode: '155140001000000010001',
        address: 'LA ESPERANZA',
        owners: [{ owner: { name: 'JUAN PEREZ' } }],
      },
      [
        {
          period: 2024,
          details: [{ concept: 'Impuesto Predial', amount: 10 }],
        },
      ],
    );

    expect(Object.keys(scalars).sort()).toEqual(
      [...LIQUIDATION_FIELDS.scalars].sort(),
    );
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [...LIQUIDATION_FIELDS.loops.rows!].sort(),
    );
  });
});

describe('validateTemplateFields (MANDAMIENTO)', () => {
  const ALL = [
    ...PAYMENT_ORDER_FIELDS.scalars,
    'liquidations',
    'liquidations.number',
    'liquidations.separator',
  ];

  it('accepts a template that uses every catalog field', () => {
    expect(validateTemplateFields('MANDAMIENTO', ALL)).toEqual({
      missing: [],
      unknown: [],
    });
  });

  it('reports the required fields it lacks and the markers it does not know', () => {
    const result = validateTemplateFields('MANDAMIENTO', [
      'cadastralCode',
      'totalAmount',
    ]);
    expect(result.missing).toEqual([
      'paymentOrderNumber',
      'capitalAmount',
      'liquidations',
    ]);
    expect(result.unknown).toEqual(['totalAmount']);
  });

  it('covers exactly the data the backend builds for a payment order', () => {
    const { liquidations, ...scalars } = buildPaymentOrderTemplateData(
      '2026-0001',
      new Date(),
      {
        cadastralCode: '155140001000000010001',
        address: 'LA ESPERANZA',
        owners: [{ owner: { name: 'JUAN PEREZ' } }],
      },
      [
        {
          period: 2024,
          resolutionNumber: '2026-0002',
          details: [{ concept: 'Impuesto Predial', amount: 10 }],
        },
      ],
    );

    expect(Object.keys(scalars).sort()).toEqual(
      [...PAYMENT_ORDER_FIELDS.scalars].sort(),
    );
    expect(Object.keys(liquidations[0]!).sort()).toEqual(
      [...PAYMENT_ORDER_FIELDS.loops.liquidations!].sort(),
    );
  });
});
