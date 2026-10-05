import { IsOptional, IsString } from 'class-validator';

// Mirrors PublicSettlementQueryCriteria: the same 2-of-3 exact-match data
// the citizen already searched with, re-sent here so the backend can
// re-validate ownership of the settlement id before generating its PDF --
// never a bare id with no corroborating data (RNF-04/anti-enumeration).
export class GenerateLiquidationDto {
  @IsOptional()
  @IsString()
  cadastralCode?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
