import { ResolutionKind } from '@prisma/client';
import { IsIn } from 'class-validator';

export class StartLiquidationsZipDto {
  @IsIn([ResolutionKind.PRESCRIPTION_RISK, ResolutionKind.NORMAL])
  kind!: ResolutionKind;
}
