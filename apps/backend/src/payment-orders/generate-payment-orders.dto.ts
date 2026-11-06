import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsPositive,
} from 'class-validator';

export const MAX_PAYMENT_ORDERS_PER_REQUEST = 5000;

export class GeneratePaymentOrdersDto {
  @ApiProperty({
    type: [Number],
    example: [101, 102],
    description:
      'Ids of the settlements to generate a payment order for (the "eligible" ones from the Excel preview).',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PAYMENT_ORDERS_PER_REQUEST)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  settlementIds: number[];
}
