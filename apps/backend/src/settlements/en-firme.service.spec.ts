import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { EnFirmeService } from './en-firme.service.js';

describe('EnFirmeService', () => {
  it('moves only current VIGENTE liquidations whose resolution is 60 days old', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 });
    const service = new EnFirmeService({
      settlement: { updateMany },
    } as never);

    const count = await service.markEnFirme(new Date('2026-10-13T12:00:00Z'));

    expect(count).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: SettlementStatus.VIGENTE,
        replacedAt: null,
        resolution: {
          is: { issuedAt: { lte: new Date('2026-08-14T12:00:00Z') } },
        },
      },
      data: { status: SettlementStatus.EN_FIRME },
    });
  });
});
