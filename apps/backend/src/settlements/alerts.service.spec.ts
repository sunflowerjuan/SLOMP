import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AlertsService } from './alerts.service.js';

describe('AlertsService', () => {
  it('queries only the live settlements of the municipality and returns counts only', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        propertyId: 1,
        period: 2000,
        status: SettlementStatus.VIGENTE,
        replacedAt: null,
        missingSince: null,
      },
    ]);
    const service = new AlertsService({ settlement: { findMany } } as never);

    const summary = await service.summary(7);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { replacedAt: null, property: { municipalityId: 7 } },
      }),
    );
    expect(summary.prescriptionRisk.count).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/cadastral|owner|address/i);
  });
});
