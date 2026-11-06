import type { LiquidationTemplateData } from '../liquidation-template/liquidation-template-data.js';
import type { PaymentOrderTemplateData } from '../payment-orders/payment-order-template-data.js';

const SHARED = {
  cadastralCode: '00-01-0001-0001-000',
  propertyName: 'Lote El Ejemplo',
  owners: 'María Pérez Gómez y Juan Rodríguez',
  startYear: '2023',
  endYear: '2025',
  capitalAmount: '$1.000.000',
};

// Fictitious data every template preview is filled with, the same for every
// municipality (contract of guided marking, section 5). Never real taxpayers.
export const PREVIEW_DATA = {
  LIQUIDACION: {
    ...SHARED,
    resolutionNumber: 'RES-0001-2026',
    totalAmount: '$1.250.000',
    interestAmount: '$250.000',
    rows: [
      {
        year: '2023',
        concept: 'Impuesto predial',
        interest: '$90.000',
        capital: '$300.000',
      },
      {
        year: '2024',
        concept: 'Impuesto predial',
        interest: '$80.000',
        capital: '$350.000',
      },
      {
        year: '2025',
        concept: 'Impuesto predial',
        interest: '$80.000',
        capital: '$350.000',
      },
    ],
  } satisfies LiquidationTemplateData,
  MANDAMIENTO: {
    ...SHARED,
    paymentOrderNumber: 'MND-0001-2026',
    issueDate: '15 de enero de 2026',
    liquidations: [
      { number: 'LIQ-0001-2026', separator: ', ' },
      { number: 'LIQ-0002-2026', separator: ' y ' },
      { number: 'LIQ-0003-2026', separator: '' },
    ],
  } satisfies PaymentOrderTemplateData,
};
