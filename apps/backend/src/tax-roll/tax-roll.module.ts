import { Module } from '@nestjs/common';
import { TaxRollController } from './tax-roll.controller.js';
import { TaxRollService } from './tax-roll.service.js';

@Module({
  controllers: [TaxRollController],
  providers: [TaxRollService],
})
export class TaxRollModule {}
