import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { reservePaymentOrderNumbers } from './payment-order-number.js';
import type { PaymentOrderGroup } from './payment-order-rules.js';

export interface IssuedPaymentOrder {
  paymentOrderId: number;
  number: string;
  issuedAt: Date;
  propertyId: number;
  settlementIds: number[];
}

// Issues one payment order per group inside the caller's transaction: reserves
// the consecutive numbers together, creates the orders and links each period
// to its order. The caller holds the payment order counter lock. Linking is
// one statement whose guard catches a period another request claimed or a tax
// roll replaced meanwhile, which aborts everything.
export async function issuePaymentOrders(
  tx: Prisma.TransactionClient,
  params: {
    municipalityId: number;
    administratorId: number | null;
    year: number;
    now: Date;
    groups: PaymentOrderGroup[];
    /** Bulk job that issues them, so a failed job can delete exactly these. */
    pdfJobId?: string;
  },
): Promise<IssuedPaymentOrder[]> {
  const { municipalityId, administratorId, year, now, groups, pdfJobId } =
    params;
  const numbers = await reservePaymentOrderNumbers(
    tx,
    municipalityId,
    year,
    groups.length,
  );
  const created = await tx.paymentOrder.createManyAndReturn({
    data: groups.map((group, i) => ({
      municipalityId,
      propertyId: group.propertyId,
      administratorId,
      number: numbers[i]!.number,
      year,
      sequence: numbers[i]!.sequence,
      issuedAt: now,
      pdfJobId,
    })),
    select: { id: true, number: true, issuedAt: true },
  });
  const orderByNumber = new Map(created.map((order) => [order.number, order]));

  const settlementIds = groups.flatMap((group) => group.settlementIds);
  const orderIds = groups.flatMap((group, i) =>
    group.settlementIds.map(() => orderByNumber.get(numbers[i]!.number)!.id),
  );
  const linked = await tx.$executeRaw`
    UPDATE "settlements" AS s SET "paymentOrderId" = m.oid
    FROM unnest(${settlementIds}::int[], ${orderIds}::int[]) AS m(sid, oid)
    WHERE s."id" = m.sid AND s."paymentOrderId" IS NULL AND s."replacedAt" IS NULL`;
  if (linked !== settlementIds.length) {
    throw new ConflictException(
      errorBody(
        ErrorCode.PAYMENT_ORDER_CONCURRENT_GENERATION,
        'Another request already generated a payment order for one of these settlements. Try again.',
      ),
    );
  }

  return groups.map((group, i) => {
    const order = orderByNumber.get(numbers[i]!.number)!;
    return {
      paymentOrderId: order.id,
      number: order.number,
      issuedAt: order.issuedAt,
      propertyId: group.propertyId,
      settlementIds: group.settlementIds,
    };
  });
}
