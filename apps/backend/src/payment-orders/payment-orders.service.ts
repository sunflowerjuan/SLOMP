import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCadastralCodesBelongToMunicipality } from '../tax-roll/assert-municipality.js';
import { parseTaxRollUpload } from '../tax-roll/parse-tax-roll-upload.js';
import { currentYearInColombia } from '../tax-roll/period-rules.js';
import type { TaxRollRowIssue } from '../tax-roll/tax-roll-row.dto.js';
import { lockCounter } from '../pdf-jobs/counter-lock.js';
import { ACTIVE_JOB_STATUSES } from '../pdf-jobs/pdf-job-rules.js';
import {
  issuePaymentOrders,
  type IssuedPaymentOrder,
} from './issue-payment-orders.js';
import {
  evaluatePaymentOrderEligibility,
  groupSettlementsByProperty,
  type PaymentOrderIneligibleReason,
} from './payment-order-rules.js';

// Cadastral codes per query: keeps the IN list well under PostgreSQL's limit
// on bind parameters, since a payment orders file can have thousands of rows.
const CODES_PER_QUERY = 5000;

const SETTLEMENT_SELECT = {
  id: true,
  propertyId: true,
  period: true,
  status: true,
  replacedAt: true,
  property: { select: { cadastralCode: true } },
  resolution: { select: { number: true, issuedAt: true } },
  paymentOrder: { select: { id: true } },
} satisfies Prisma.SettlementSelect;

type SettlementForOrder = Prisma.SettlementGetPayload<{
  select: typeof SETTLEMENT_SELECT;
}>;

export type PaymentOrderRejectionReason =
  PaymentOrderIneligibleReason | 'SETTLEMENT_NOT_FOUND';

export interface PaymentOrderImportRow {
  cadastralCode: string;
  period: number;
  // null when the file lists a property+period with no current settlement.
  settlementId: number | null;
}

export interface PaymentOrderImportPreview {
  fileName: string;
  // Distinct property+period pairs the file asks a payment order for.
  rows: number;
  eligible: (PaymentOrderImportRow & { resolutionNumber: string })[];
  ineligible: (PaymentOrderImportRow & {
    reason: PaymentOrderRejectionReason;
    // Only for NOT_YET_FIRM.
    firmOn?: Date;
  })[];
  // Row problems found by the tax roll parser (same rules as the tax roll).
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
}

export interface GeneratePaymentOrdersResult {
  // One per property of the request, covering all its eligible periods.
  created: IssuedPaymentOrder[];
  rejected: {
    settlementId: number;
    reason: PaymentOrderRejectionReason;
    firmOn?: Date;
  }[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function candidateOf(settlement: SettlementForOrder) {
  return {
    status: settlement.status,
    replacedAt: settlement.replacedAt,
    resolutionIssuedAt: settlement.resolution?.issuedAt ?? null,
    hasPaymentOrder: settlement.paymentOrder !== null,
  };
}

@Injectable()
export class PaymentOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // Reads the payment orders Excel (same columns and same validations as the
  // tax roll, including the municipality of the cadastral codes) and says, for
  // each property+period in it, whether a payment order can be generated now.
  // Saves nothing.
  async previewImport(
    municipality: MunicipalityContext,
    buffer: Buffer,
    fileName: string,
    now: Date = new Date(),
  ): Promise<PaymentOrderImportPreview> {
    const parsed = await parseTaxRollUpload(buffer);
    await assertCadastralCodesBelongToMunicipality(
      this.prisma,
      municipality,
      parsed.validRows.map((row) => row.cadastralCode),
    );

    const pairs = new Map<string, { cadastralCode: string; period: number }>();
    for (const row of parsed.validRows) {
      pairs.set(`${row.cadastralCode}:${row.period}`, {
        cadastralCode: row.cadastralCode,
        period: row.period,
      });
    }

    const codes = [...new Set([...pairs.values()].map((p) => p.cadastralCode))];
    const settlementByPair = new Map<string, SettlementForOrder>();
    for (const codesChunk of chunk(codes, CODES_PER_QUERY)) {
      const settlements = await this.prisma.settlement.findMany({
        where: {
          replacedAt: null,
          property: {
            municipalityId: municipality.id,
            cadastralCode: { in: codesChunk },
          },
        },
        select: SETTLEMENT_SELECT,
      });
      for (const settlement of settlements) {
        settlementByPair.set(
          `${settlement.property.cadastralCode}:${settlement.period}`,
          settlement,
        );
      }
    }

    const preview: PaymentOrderImportPreview = {
      fileName,
      rows: pairs.size,
      eligible: [],
      ineligible: [],
      invalidRows: parsed.invalidRows,
      warnings: parsed.warnings,
    };
    for (const [key, pair] of pairs) {
      const settlement = settlementByPair.get(key);
      if (!settlement) {
        preview.ineligible.push({
          ...pair,
          settlementId: null,
          reason: 'SETTLEMENT_NOT_FOUND',
        });
        continue;
      }
      const row = { ...pair, settlementId: settlement.id };
      const result = evaluatePaymentOrderEligibility(
        candidateOf(settlement),
        now,
      );
      if (result.eligible) {
        preview.eligible.push({
          ...row,
          resolutionNumber: settlement.resolution!.number,
        });
      } else {
        preview.ineligible.push({
          ...row,
          reason: result.reason,
          ...(result.firmOn && { firmOn: result.firmOn }),
        });
      }
    }
    return preview;
  }

  // Generates a payment order for each given settlement that is eligible and
  // reports the rest with the reason. Authoritative: it re-checks every rule
  // here, whatever an earlier preview said. A settlement of another
  // municipality is reported as not found, like one that does not exist.
  async generate(
    municipalityId: number,
    administratorId: number,
    settlementIds: number[],
    now: Date = new Date(),
  ): Promise<GeneratePaymentOrdersResult> {
    const ids = [...new Set(settlementIds)].sort((a, b) => a - b);
    const settlements = await this.prisma.settlement.findMany({
      where: { id: { in: ids }, property: { municipalityId } },
      select: SETTLEMENT_SELECT,
    });
    const settlementById = new Map(settlements.map((s) => [s.id, s]));

    const result: GeneratePaymentOrdersResult = { created: [], rejected: [] };
    const toCreate: SettlementForOrder[] = [];
    for (const id of ids) {
      const settlement = settlementById.get(id);
      if (!settlement) {
        result.rejected.push({
          settlementId: id,
          reason: 'SETTLEMENT_NOT_FOUND',
        });
        continue;
      }
      const eligibility = evaluatePaymentOrderEligibility(
        candidateOf(settlement),
        now,
      );
      if (eligibility.eligible) {
        toCreate.push(settlement);
      } else {
        result.rejected.push({
          settlementId: id,
          reason: eligibility.reason,
          ...(eligibility.firmOn && { firmOn: eligibility.firmOn }),
        });
      }
    }
    if (toCreate.length === 0) return result;

    const year = currentYearInColombia(now);
    const groups = groupSettlementsByProperty(toCreate);
    const issued = await this.prisma.$transaction(async (tx) => {
      // Same lock as the bulk job: while the municipality has one running,
      // its range of numbers must stay contiguous so it can be reverted.
      await lockCounter(tx, municipalityId, year, 'paymentOrder');
      const activeJobs = await tx.pdfJob.count({
        where: { municipalityId, status: { in: ACTIVE_JOB_STATUSES } },
      });
      if (activeJobs > 0) {
        throw new ConflictException(
          errorBody(
            ErrorCode.BULK_GENERATION_IN_PROGRESS,
            'A bulk generation job is running for this municipality. Try again when it finishes.',
          ),
        );
      }
      return issuePaymentOrders(tx, {
        municipalityId,
        administratorId,
        year,
        now,
        groups,
      });
    });
    result.created = issued;
    return result;
  }

  // The latest payment orders of the municipality, newest first. There is no
  // pagination yet: the limit is enough for what the panel needs to show.
  async list(municipalityId: number) {
    const orders = await this.prisma.paymentOrder.findMany({
      where: { municipalityId },
      orderBy: { issuedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        issuedAt: true,
        property: { select: { cadastralCode: true } },
        settlements: { select: { id: true, period: true } },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      number: order.number,
      issuedAt: order.issuedAt,
      cadastralCode: order.property.cadastralCode,
      settlementIds: order.settlements.map((s) => s.id),
      periods: order.settlements.map((s) => s.period).sort((a, b) => a - b),
    }));
  }
}
