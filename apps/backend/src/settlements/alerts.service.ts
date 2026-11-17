import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentYearInColombia } from '../tax-roll/period-rules.js';
import { summarizeAlerts } from './alert-rules.js';
import type { AlertsSummary } from './alert-rules.js';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  // Computed on every call (no cache), so a status change shows right away.
  // shortcut: rows are filtered in memory with the SL-136 rules; move the
  // filter into SQL if a municipality's live settlements grow past ~1M rows.
  async summary(municipalityId: number): Promise<AlertsSummary> {
    const settlements = await this.prisma.settlement.findMany({
      where: { replacedAt: null, property: { municipalityId } },
      select: {
        propertyId: true,
        period: true,
        status: true,
        replacedAt: true,
        missingSince: true,
      },
    });
    return summarizeAlerts(settlements, currentYearInColombia());
  }
}
