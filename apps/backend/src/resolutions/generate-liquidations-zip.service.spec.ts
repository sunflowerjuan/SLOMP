import { BadRequestException, NotFoundException } from '@nestjs/common';
import PizZip from 'pizzip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenerateLiquidationsZipService,
  MAX_BULK_LIQUIDATIONS,
} from './generate-liquidations-zip.service.js';

type PendingSettlement = { id: number; propertyId: number; period: number };

function buildPrisma(pending: PendingSettlement[]) {
  return {
    settlement: {
      findMany: vi.fn(async () => pending),
    },
  };
}

function buildGenerateLiquidationPdfService() {
  return {
    generateForSettlement: vi.fn(async (settlementId: number) => ({
      pdf: Buffer.from(`pdf-for-${settlementId}`),
      resolutionNumber: `2026-${String(settlementId).padStart(4, '0')}`,
    })),
  };
}

function zipEntryNames(buffer: Buffer): string[] {
  const files = new PizZip(buffer).files;
  return Object.keys(files).filter((name) => !files[name].dir);
}

describe('GenerateLiquidationsZipService', () => {
  const CURRENT_YEAR = 2026; // periods <= 2021 are prescription risk

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${CURRENT_YEAR}-06-15T12:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws NotFoundException when there are no pending liquidations', async () => {
    const prisma = buildPrisma([]);
    const pdfService = buildGenerateLiquidationPdfService();
    const service = new GenerateLiquidationsZipService(
      prisma as never,
      pdfService as never,
    );

    await expect(service.generateZip()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws BadRequestException when the portfolio exceeds the batch cap', async () => {
    const pending: PendingSettlement[] = Array.from(
      { length: MAX_BULK_LIQUIDATIONS + 1 },
      (_, index) => ({ id: index + 1, propertyId: index + 1, period: 2025 }),
    );
    const prisma = buildPrisma(pending);
    const pdfService = buildGenerateLiquidationPdfService();
    const service = new GenerateLiquidationsZipService(
      prisma as never,
      pdfService as never,
    );

    await expect(service.generateZip()).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(pdfService.generateForSettlement).not.toHaveBeenCalled();
  });

  it('puts each kind in its own folder, named after the real prescription cutoff year', async () => {
    const prisma = buildPrisma([
      { id: 1, propertyId: 10, period: 2025 }, // normal
      { id: 2, propertyId: 20, period: 2018 }, // prescription risk
    ]);
    const pdfService = buildGenerateLiquidationPdfService();
    const service = new GenerateLiquidationsZipService(
      prisma as never,
      pdfService as never,
    );

    const zip = await service.generateZip();

    expect(zipEntryNames(zip).sort()).toEqual(
      [
        'Liquidaciones 2022 en adelante/2026-0001.pdf',
        'Liquidaciones antes de 2022/2026-0002.pdf',
      ].sort(),
    );
  });

  it('calls generateForSettlement once per (property, kind) group, not once per settlement', async () => {
    const prisma = buildPrisma([
      { id: 1, propertyId: 10, period: 2025 },
      { id: 2, propertyId: 10, period: 2024 }, // same property+kind as id 1
      { id: 3, propertyId: 20, period: 2025 },
    ]);
    const pdfService = buildGenerateLiquidationPdfService();
    const service = new GenerateLiquidationsZipService(
      prisma as never,
      pdfService as never,
    );

    await service.generateZip();

    expect(pdfService.generateForSettlement).toHaveBeenCalledTimes(2);
  });
});
