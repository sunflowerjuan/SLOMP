import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module.js';
import { PdfJobsModule } from '../pdf-jobs/pdf-jobs.module.js';
import { GeneratePaymentOrderPdfService } from './generate-payment-order-pdf.service.js';
import { PaymentOrdersController } from './payment-orders.controller.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@Module({
  imports: [PdfJobsModule, AssistantModule],
  controllers: [PaymentOrdersController],
  providers: [PaymentOrdersService, GeneratePaymentOrderPdfService],
})
export class PaymentOrdersModule {}
