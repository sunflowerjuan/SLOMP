import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ASSISTANT_SETTLEMENT_SELECT,
  toAssistantSettlement,
  type AssistantSettlement,
} from './assistant-settlement.js';
import {
  reviewStatusChanges,
  type StatusChangeRequest,
  type StatusChangeReview,
} from './review-status-changes.js';

export const MAX_SEARCH_RESULTS = 50;
export const MAX_UNLISTED_ROWS = 5000;
export const MAX_CHANGES_PER_CALL = 100;

// Cadastral codes per query, well under PostgreSQL's limit on bind
// parameters (same as the payment orders import).
const CODES_PER_QUERY = 5000;

export interface SearchSettlementsInput {
  cadastralCode?: string;
  settlementId?: number;
}

export interface PaymentOrderFileRow {
  cadastralCode: string;
  period: number;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException(
    errorBody(ErrorCode.ASSISTANT_TOOL_INPUT_INVALID, message),
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// The three tools Slompsim calls (Confluence "Diseño de Slompsim"). Internal
// services, not routes the model reaches: the conversation loop
// calls them for the active municipality. None of them writes.
@Injectable()
export class AssistantToolsService {
  constructor(private readonly prisma: PrismaService) {}

  // search_settlements: by cadastral code or by settlement number, exactly
  // one of them. Never by owner or address: those reach the search of
  // Liquidaciones. A settlement number isn't personal data, and without it
  // the assistant can't answer about "la liquidación 123".
  async searchSettlements(
    municipalityId: number,
    input: SearchSettlementsInput,
    now: Date = new Date(),
  ): Promise<AssistantSettlement[]> {
    const cadastralCode =
      typeof input.cadastralCode === 'string'
        ? input.cadastralCode.trim()
        : undefined;
    const { settlementId } = input;
    if (Boolean(cadastralCode) === (settlementId !== undefined)) {
      throw invalid('Give exactly one of cadastralCode or settlementId.');
    }
    if (
      settlementId !== undefined &&
      (!Number.isInteger(settlementId) || settlementId <= 0)
    ) {
      throw invalid('settlementId must be a positive integer.');
    }

    const where: Prisma.SettlementWhereInput = {
      replacedAt: null,
      property: {
        municipalityId,
        ...(cadastralCode ? { cadastralCode } : {}),
      },
      ...(settlementId !== undefined ? { id: settlementId } : {}),
    };
    const rows = await this.prisma.settlement.findMany({
      where,
      select: ASSISTANT_SETTLEMENT_SELECT,
      orderBy: [{ property: { cadastralCode: 'asc' } }, { period: 'asc' }],
      take: MAX_SEARCH_RESULTS,
    });
    return rows.map((row) => toAssistantSettlement(row, now));
  }

  // find_unlisted_periods: given the rows of the payment orders Excel, for
  // every property that appears with at least one period, its current
  // settlements whose period is not in the file. Also what the import of
  // that file returns as `unlisted`.
  async findUnlistedPeriods(
    municipalityId: number,
    rows: PaymentOrderFileRow[],
    now: Date = new Date(),
  ): Promise<AssistantSettlement[]> {
    if (rows.length > MAX_UNLISTED_ROWS) {
      throw invalid(`At most ${MAX_UNLISTED_ROWS} rows.`);
    }
    const listed = new Map<string, Set<number>>();
    for (const { cadastralCode, period } of rows) {
      const code = cadastralCode.trim();
      listed.set(code, (listed.get(code) ?? new Set()).add(period));
    }

    const unlisted: AssistantSettlement[] = [];
    for (const codes of chunk([...listed.keys()], CODES_PER_QUERY)) {
      const settlements = await this.prisma.settlement.findMany({
        where: {
          replacedAt: null,
          property: { municipalityId, cadastralCode: { in: codes } },
        },
        select: ASSISTANT_SETTLEMENT_SELECT,
      });
      for (const settlement of settlements) {
        const periods = listed.get(settlement.property.cadastralCode);
        if (periods && !periods.has(settlement.period)) {
          unlisted.push(toAssistantSettlement(settlement, now));
        }
      }
    }
    return unlisted.sort(
      (a, b) =>
        a.cadastralCode.localeCompare(b.cadastralCode) || a.period - b.period,
    );
  }

  // propose_status_change: checks each change with the domain rules and says
  // which would apply. Writes nothing: the Administrator applies a proposal
  // from the panel (POST .../assistant/changes/confirm).
  async proposeStatusChange(
    municipalityId: number,
    changes: StatusChangeRequest[],
    now: Date = new Date(),
  ): Promise<StatusChangeReview> {
    assertChanges(changes);
    const rows = await this.prisma.settlement.findMany({
      where: {
        id: { in: changes.map((change) => change.settlementId) },
        property: { municipalityId },
      },
      select: ASSISTANT_SETTLEMENT_SELECT,
    });
    return reviewStatusChanges(rows, changes, now);
  }
}

// The HTTP bodies are checked by class-validator; this covers the tool calls,
// whose arguments come from the model.
export function assertChanges(changes: StatusChangeRequest[]): void {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw invalid('Give at least one change.');
  }
  if (changes.length > MAX_CHANGES_PER_CALL) {
    throw invalid(`At most ${MAX_CHANGES_PER_CALL} changes per call.`);
  }
  const ids = changes.map((change) => change.settlementId);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw invalid('settlementId must be a positive integer.');
  }
  if (new Set(ids).size !== ids.length) {
    throw invalid('Each settlement can appear only once.');
  }
}
