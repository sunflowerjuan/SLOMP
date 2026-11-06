import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_UNLISTED_ROWS } from './assistant-tools.service.js';

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_TURNS = 10;
// An assistant turn can list many periods.
export const MAX_TURN_LENGTH = 8000;

export class ConversationTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_TURN_LENGTH)
  content: string;
}

export class PaymentOrderRowDto {
  @ApiProperty({ example: '155140001000200030000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  cadastralCode: string;

  @ApiProperty({ example: 2020 })
  @IsInt()
  @Min(1900)
  @Max(2200)
  period: number;
}

export class AssistantContextDto {
  @ApiPropertyOptional({
    type: [PaymentOrderRowDto],
    description:
      'Rows of the payment orders Excel loaded in this conversation, for find_unlisted_periods.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_UNLISTED_ROWS)
  @ValidateNested({ each: true })
  @Type(() => PaymentOrderRowDto)
  paymentOrderRows?: PaymentOrderRowDto[];
}

export class AssistantMessageDto {
  @ApiProperty({ example: 'Marca como pagada la liquidación 123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  message: string;

  @ApiPropertyOptional({
    type: [ConversationTurnDto],
    description: `The last turns of the conversation (at most ${MAX_HISTORY_TURNS}); the server keeps none.`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HISTORY_TURNS)
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  history?: ConversationTurnDto[];

  @ApiPropertyOptional({ type: AssistantContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context?: AssistantContextDto;
}
