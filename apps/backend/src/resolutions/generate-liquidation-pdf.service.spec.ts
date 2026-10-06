import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ResolutionKind, SettlementStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../liquidation-template/render-liquidation-docx.js', () => ({
  LiquidationTemplateError: class LiquidationTemplateError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  renderLiquidationDocx: vi.fn(() => Buffer.from('fake-docx')),
}));
vi.mock('../liquidation-template/convert-docx-to-pdf.js', () => ({
  PdfConversionError: class PdfConversionError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  convertDocxToPdf: vi.fn(async () => Buffer.from('%PDF-fake')),
}));

import {
  convertDocxToPdf,
  PdfConversionError,
} from '../liquidation-template/convert-docx-to-pdf.js';
import { renderLiquidationDocx } from '../liquidation-template/render-liquidation-docx.js';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';
import { ErrorCode } from '../common/errors/error-codes.js';

function decimal(value: number) {
  return { toNumber: () => value };
}

const PROPERTY = {
  id: 1,
  cadastralCode: '155140001000000010019000000000',
  address: 'LA FORTUNA VDA EL OSO',
  owners: [{ owner: { name: 'Nelly Pineda' } }],
};

type FakeSettlement = {
  id: number;
  propertyId: number;
  period: number;
  status: SettlementStatus;
  replacedAt: Date | null;
  resolutionId: number | null;
  details: { concept: string; amount: ReturnType<typeof decimal> }[];
};

type FakeResolution = {
  id: number;
  number: string;
  year: number;
  sequence: number;
  kind: ResolutionKind;
  propertyId: number;
};

class FakePrisma {
  private nextId = 1;
  settlements: FakeSettlement[] = [];
  resolutions: FakeResolution[] = [];
  counters = new Map<number, number>();

  settlement = {
    findUnique: async ({ where }: { where: { id: number } }) => {
      const s = this.settlements.find((x) => x.id === where.id);
      if (!s) return null;
      return { ...s, property: PROPERTY };
    },
    findMany: async ({
      where,
    }: {
      where: {
        propertyId?: number;
        replacedAt?: null;
        resolutionId?: null | { in: number[] };
        id?: { in: number[] };
      };
    }) =>
      this.settlements
        .filter((s) =>
          where.propertyId === undefined
            ? true
            : s.propertyId === where.propertyId,
        )
        .filter((s) =>
          where.replacedAt === undefined ? true : s.replacedAt === null,
        )
        .filter((s) =>
          'resolutionId' in where && where.resolutionId === null
            ? s.resolutionId === null
            : true,
        )
        .filter((s) => (where.id ? where.id.in.includes(s.id) : true)),
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: { in: number[] }; resolutionId: null };
      data: { resolutionId: number };
    }) => {
      let count = 0;
      for (const s of this.settlements) {
        if (
          where.id.in.includes(s.id) &&
          s.resolutionId === where.resolutionId
        ) {
          s.resolutionId = data.resolutionId;
          count += 1;
        }
      }
      return { count };
    },
  };

  resolution = {
    findUniqueOrThrow: async ({ where }: { where: { id: number } }) => {
      const r = this.resolutions.find((x) => x.id === where.id);
      if (!r) throw new Error('Resolution not found');
      return {
        ...r,
        settlements: this.settlements.filter((s) => s.resolutionId === r.id),
      };
    },
    create: async ({ data }: { data: Omit<FakeResolution, 'id'> }) => {
      const resolution = { id: this.nextId++, ...data };
      this.resolutions.push(resolution);
      return resolution;
    },
  };

  resolutionCounter = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { year: number };
      create: { year: number; lastSequence: number };
      update: { lastSequence: { increment: number } };
      select: { lastSequence: true };
    }) => {
      const lastSequence = this.counters.has(where.year)
        ? this.counters.get(where.year)! + update.lastSequence.increment
        : create.lastSequence;
      this.counters.set(where.year, lastSequence);
      return { lastSequence };
    },
  };

  $transaction = vi.fn(async (fn: (tx: this) => Promise<unknown>) => fn(this));
}

function buildSettlement(overrides: Partial<FakeSettlement>): FakeSettlement {
  return {
    id: 1,
    propertyId: PROPERTY.id,
    period: 2024,
    status: SettlementStatus.VIGENTE,
    replacedAt: null,
    resolutionId: null,
    details: [{ concept: 'Impuesto Predial', amount: decimal(100000) }],
    ...overrides,
  };
}

describe('GenerateLiquidationPdfService', () => {
  beforeEach(() => {
    vi.mocked(renderLiquidationDocx).mockClear();
    vi.mocked(convertDocxToPdf).mockClear();
  });

  it('throws NotFoundException when the settlement does not exist', async () => {
    const prisma = new FakePrisma();
    const service = new GenerateLiquidationPdfService(prisma as never);

    await expect(service.generateForSettlement(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the settlement was replaced', async () => {
    const prisma = new FakePrisma();
    prisma.settlements.push(buildSettlement({ id: 1, replacedAt: new Date() }));
    const service = new GenerateLiquidationPdfService(prisma as never);

    await expect(service.generateForSettlement(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reserves a new resolution number and groups same-kind siblings on first generation', async () => {
    const prisma = new FakePrisma();
    prisma.settlements.push(
      buildSettlement({ id: 1, period: 2025 }),
      buildSettlement({ id: 2, period: 2024 }),
      // Different kind (prescription risk): must NOT be grouped in.
      buildSettlement({ id: 3, period: 2018 }),
    );
    const service = new GenerateLiquidationPdfService(prisma as never);

    const result = await service.generateForSettlement(1);

    expect(result.resolutionNumber).toMatch(/^\d{4}-\d{4}$/);
    expect(result.pdf.toString()).toBe('%PDF-fake');
    expect(prisma.resolutions).toHaveLength(1);
    expect(prisma.resolutions[0].kind).toBe(ResolutionKind.NORMAL);

    const resolutionId = prisma.resolutions[0].id;
    expect(prisma.settlements.find((s) => s.id === 1)?.resolutionId).toBe(
      resolutionId,
    );
    expect(prisma.settlements.find((s) => s.id === 2)?.resolutionId).toBe(
      resolutionId,
    );
    // The prescription-risk settlement was left alone.
    expect(prisma.settlements.find((s) => s.id === 3)?.resolutionId).toBeNull();

    expect(renderLiquidationDocx).toHaveBeenCalledTimes(1);
    expect(convertDocxToPdf).toHaveBeenCalledTimes(1);
  });

  it('re-renders the same resolution without reserving a new number when already generated', async () => {
    const prisma = new FakePrisma();
    prisma.resolutions.push({
      id: 10,
      number: '2026-0007',
      year: 2026,
      sequence: 7,
      kind: ResolutionKind.NORMAL,
      propertyId: PROPERTY.id,
    });
    prisma.settlements.push(buildSettlement({ id: 1, resolutionId: 10 }));
    const service = new GenerateLiquidationPdfService(prisma as never);

    const result = await service.generateForSettlement(1);

    expect(result.resolutionNumber).toBe('2026-0007');
    expect(prisma.resolutions).toHaveLength(1); // no new Resolution created
    expect(prisma.counters.size).toBe(0); // reserveResolutionNumber never called
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictException when a concurrent request already claimed a sibling settlement', async () => {
    const prisma = new FakePrisma();
    prisma.settlements.push(
      buildSettlement({ id: 1, period: 2025 }),
      buildSettlement({ id: 2, period: 2024 }),
    );
    // Simulate a race: settlement 2 gets claimed by another resolution right
    // before this one's updateMany runs, by making updateMany report a
    // smaller count than requested.
    const realUpdateMany = prisma.settlement.updateMany.bind(prisma.settlement);
    prisma.settlement.updateMany = async (args) => {
      const result = await realUpdateMany(args);
      return { count: result.count - 1 };
    };
    const service = new GenerateLiquidationPdfService(prisma as never);

    await expect(service.generateForSettlement(1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an incomplete liquidation before rendering or converting a PDF', async () => {
    const prisma = new FakePrisma();
    prisma.settlements.push(buildSettlement({ id: 1, details: [] }));
    const service = new GenerateLiquidationPdfService(prisma as never);

    await expect(service.generateForSettlement(1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.resolutions).toHaveLength(0);
    expect(prisma.counters.size).toBe(0);
    expect(renderLiquidationDocx).not.toHaveBeenCalled();
    expect(convertDocxToPdf).not.toHaveBeenCalled();
  });

  it('returns a controlled HTTP error instead of a PDF when conversion fails', async () => {
    const prisma = new FakePrisma();
    prisma.settlements.push(buildSettlement({ id: 1 }));
    vi.mocked(convertDocxToPdf).mockRejectedValueOnce(
      new PdfConversionError(
        ErrorCode.PDF_CONVERSION_TIMEOUT,
        'PDF generation timed out after 25 seconds.',
      ),
    );
    const service = new GenerateLiquidationPdfService(prisma as never);

    const failure = service.generateForSettlement(1);
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException);
    // The specific code must survive the 503 so the UI can explain it.
    await expect(failure).rejects.toMatchObject({
      response: { code: 'PDF_CONVERSION_TIMEOUT' },
    });
  });

  it('a property with periods in both ranges produces two resolutions with distinct numbers and kinds', async () => {
    const prisma = new FakePrisma();
    prisma.settlements.push(
      buildSettlement({ id: 1, period: 2024 }), // normal
      buildSettlement({ id: 2, period: 2018 }), // prescription risk
    );
    const service = new GenerateLiquidationPdfService(prisma as never);

    const normal = await service.generateForSettlement(1);
    const prescriptionRisk = await service.generateForSettlement(2);

    expect(normal.resolutionNumber).not.toBe(prescriptionRisk.resolutionNumber);
    expect(prisma.resolutions.map((r) => r.kind).sort()).toEqual(
      [ResolutionKind.NORMAL, ResolutionKind.PRESCRIPTION_RISK].sort(),
    );
  });
});
