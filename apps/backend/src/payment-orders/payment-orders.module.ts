import { Module } from '@nestjs/common';
import { PaymentOrdersController } from './payment-orders.controller.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@Module({
  controllers: [PaymentOrdersController],
  providers: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
