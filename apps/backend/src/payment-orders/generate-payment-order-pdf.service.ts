import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PdfServiceClient } from '../pdf-jobs/pdf-service.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildPaymentOrderTemplateData,
  missingPaymentOrderData,
  templateSettlementsOf,
} from './build-payment-order-template-data.js';

export interface GeneratedPaymentOrderPdf {
  pdf: Buffer;
  number: string;
}

export const paymentOrderForPdf = {
  property: { include: { owners: { include: { owner: true } } } },
  settlements: {
    include: { details: true, resolution: { select: { number: true } } },
    orderBy: { period: 'asc' },
  },
} as const;

@Injectable()
export class GeneratePaymentOrderPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfServiceClient,
  ) {}

  // Administrator panel: renders a payment order already issued (by
  // PaymentOrdersService.generate). Never reserves a number, so it can be
  // downloaded again. One of another municipality is "not found".
  async generate(
    municipalityId: number,
    paymentOrderId: number,
  ): Promise<GeneratedPaymentOrderPdf> {
    const template = await this.pdf.activeTemplate(
      municipalityId,
      'MANDAMIENTO',
    );
    const order = await this.prisma.paymentOrder.findFirst({
      where: { id: paymentOrderId, municipalityId },
      include: paymentOrderForPdf,
    });
    if (!order) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.PAYMENT_ORDER_NOT_FOUND,
          `Payment order ${paymentOrderId} not found.`,
        ),
      );
    }

    const settlements = templateSettlementsOf(order.settlements);
    const missing = missingPaymentOrderData(order.property, settlements);
    if (missing.length > 0) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
          `Cannot generate the payment order PDF because required data is missing or invalid: ${missing.join(', ')}. Complete the liquidation and try again.`,
          { missing },
        ),
      );
    }
    const data = buildPaymentOrderTemplateData(
      order.number,
      order.issuedAt,
      order.property,
      settlements,
    );
    const pdf = await this.pdf.render({
      schemaVersion: 1,
      documentType: 'MANDAMIENTO',
      template,
      data: data as unknown as Record<string, unknown>,
    });
    return { pdf, number: order.number };
  }
}
