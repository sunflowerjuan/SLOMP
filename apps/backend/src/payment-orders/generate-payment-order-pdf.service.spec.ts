import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { GeneratePaymentOrderPdfService } from './generate-payment-order-pdf.service.js';

const TEMPLATE = { blob: 'templates/paez/mandamiento/1.docx', sha256: 'abc' };
const decimal = (value: number) => ({ toNumber: () => value });

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    number: '2026-0007',
    issuedAt: new Date('2026-10-16T15:00:00Z'),
    property: {
      cadastralCode: '155140001000000010001',
      address: 'LA ESPERANZA',
      owners: [{ owner: { name: 'JUAN PEREZ' } }],
    },
    settlements: [
      {
        period: 2021,
        details: [{ concept: 'Impuesto Predial', amount: decimal(100) }],
        resolution: { number: '2026-0001' },
      },
      {
        period: 2022,
        details: [{ concept: 'Impuesto Predial', amount: decimal(50) }],
        resolution: { number: '2026-0002' },
      },
    ],
    ...overrides,
  };
}

function build(found: unknown) {
  const prisma = {
    paymentOrder: { findFirst: vi.fn(async () => found) },
  };
  const pdf = {
    activeTemplate: vi.fn(async () => TEMPLATE),
    render: vi.fn(async () => Buffer.from('%PDF')),
  };
  return {
    service: new GeneratePaymentOrderPdfService(prisma as never, pdf as never),
    prisma,
    pdf,
  };
}

describe('GeneratePaymentOrderPdfService', () => {
  it('renders the MANDAMIENTO template with one payment order covering all its periods', async () => {
    const { service, pdf, prisma } = build(order());

    const result = await service.generate(1, 5);

    expect(result).toEqual({ pdf: Buffer.from('%PDF'), number: '2026-0007' });
    expect(pdf.activeTemplate).toHaveBeenCalledWith(1, 'MANDAMIENTO');
    expect(prisma.paymentOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, municipalityId: 1 } }),
    );
    expect(pdf.render).toHaveBeenCalledWith({
      schemaVersion: 1,
      documentType: 'MANDAMIENTO',
      template: TEMPLATE,
      data: {
        paymentOrderNumber: '2026-0007',
        issueDate: '16/10/2026',
        cadastralCode: '155140001000000010001',
        propertyName: 'LA ESPERANZA',
        owners: 'JUAN PEREZ',
        startYear: '2021',
        endYear: '2022',
        capitalAmount: '$ 150',
        liquidations: [
          { number: '2026-0001', separator: ' y ' },
          { number: '2026-0002', separator: '' },
        ],
      },
    });
  });

  it('answers 404 for a payment order that is not in the municipality, rendering nothing', async () => {
    const { service, pdf } = build(null);

    await expect(service.generate(1, 5)).rejects.toMatchObject({
      status: 404,
      response: { code: ErrorCode.PAYMENT_ORDER_NOT_FOUND },
    });
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('answers 400 with the missing fields instead of rendering a document with holes', async () => {
    const { service, pdf } = build(
      order({
        property: {
          cadastralCode: '155140001000000010001',
          address: ' ',
          owners: [],
        },
      }),
    );

    await expect(service.generate(1, 5)).rejects.toMatchObject({
      status: 400,
      response: {
        code: ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
        details: { missing: ['PROPERTY_ADDRESS'] },
      },
    });
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('asks for the template before looking anything up, so a missing one answers 503 first', async () => {
    const { service, pdf, prisma } = build(order());
    pdf.activeTemplate.mockRejectedValue(new Error('no template'));

    await expect(service.generate(1, 5)).rejects.toThrow('no template');
    expect(prisma.paymentOrder.findFirst).not.toHaveBeenCalled();
  });
});
