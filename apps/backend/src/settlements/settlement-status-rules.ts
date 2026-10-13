import { SettlementStatus } from '@prisma/client';

// Rules agreed with the client on 13/10/2026 (Confluence: "Reglas de Negocio
// y Actores"). Pure functions: no Prisma, no clock -- `now` is passed in.

// A resolution becomes final ("en firme") this many days after it is issued;
// issuing and notifying are the same date (it shows up in the public
// consultation as soon as it is generated).
export const EN_FIRME_DAYS = 60;

// An EN_FIRME liquidation can only be marked PRESCRITA once its payment order
// (mandamiento de pago) is at least this old.
export const PRESCRIPTION_AFTER_PAYMENT_ORDER_YEARS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatusContext {
  current: SettlementStatus;
  // Null while the periods don't have a resolution yet.
  resolutionIssuedAt: Date | null;
  // Earliest payment order of the group; null when none was issued.
  firstPaymentOrderAt: Date | null;
  now: Date;
}

export function enFirmeCutoff(now: Date): Date {
  return new Date(now.getTime() - EN_FIRME_DAYS * DAY_MS);
}

// The state a liquidation sits in when nothing else applies to it: VIGENTE,
// or EN_FIRME once 60 days have passed since its resolution was issued.
export function baseStatus(
  resolutionIssuedAt: Date | null,
  now: Date,
): SettlementStatus {
  return resolutionIssuedAt !== null &&
    resolutionIssuedAt.getTime() <= enFirmeCutoff(now).getTime()
    ? SettlementStatus.EN_FIRME
    : SettlementStatus.VIGENTE;
}

function yearsLater(date: Date, years: number): Date {
  const later = new Date(date);
  later.setFullYear(later.getFullYear() + years);
  return later;
}

// States the Administrator may set for a liquidation, given where it is now.
// VIGENTE and EN_FIRME are never picked freely: only "back to its base
// state" (so EN_FIRME never returns to VIGENTE, and VIGENTE can't be chosen
// once the 60 days have passed). The current state is always included, so
// re-sending it is a no-op instead of an error.
export function allowedStatuses(context: StatusContext): SettlementStatus[] {
  const base = baseStatus(context.resolutionIssuedAt, context.now);
  const canPrescribe =
    base === SettlementStatus.VIGENTE ||
    (context.firstPaymentOrderAt !== null &&
      yearsLater(
        context.firstPaymentOrderAt,
        PRESCRIPTION_AFTER_PAYMENT_ORDER_YEARS,
      ).getTime() <= context.now.getTime());

  const allowed = new Set<SettlementStatus>([
    context.current,
    base,
    SettlementStatus.PAGADA,
    SettlementStatus.ACUERDO_DE_PAGO,
  ]);
  if (canPrescribe) allowed.add(SettlementStatus.PRESCRITA);
  return Object.values(SettlementStatus).filter((status) =>
    allowed.has(status),
  );
}

export function isTransitionAllowed(
  context: StatusContext,
  target: SettlementStatus,
): boolean {
  return allowedStatuses(context).includes(target);
}
