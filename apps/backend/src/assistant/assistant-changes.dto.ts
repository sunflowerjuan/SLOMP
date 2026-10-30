import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_CHANGES_PER_CALL } from './assistant-tools.service.js';

export const MAX_NOTE_LENGTH = 500;

export class StatusChangeDto {
  @ApiProperty({ example: 123 })
  @IsInt()
  @IsPositive()
  settlementId: number;

  @ApiProperty({ enum: SettlementStatus, example: SettlementStatus.PAGADA })
  @IsEnum(SettlementStatus)
  toStatus: SettlementStatus;
}

export class StatusChangesDto {
  @ApiProperty({ type: [StatusChangeDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_CHANGES_PER_CALL)
  @ArrayUnique((change: StatusChangeDto) => change.settlementId)
  @ValidateNested({ each: true })
  @Type(() => StatusChangeDto)
  changes: StatusChangeDto[];
}

export class ConfirmStatusChangesDto extends StatusChangesDto {
  @ApiPropertyOptional({
    maxLength: MAX_NOTE_LENGTH,
    example: 'Firmó el lunes',
    description: 'Stored with every applied change.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string;
}
