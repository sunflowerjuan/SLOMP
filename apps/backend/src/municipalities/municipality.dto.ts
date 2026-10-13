import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// DANE code and slug formats are checked in MunicipalitiesService so each
// failure carries its own error code instead of a generic validation error.
export class CreateMunicipalityDto {
  @ApiProperty({ example: 'Páez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Boyacá' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '15514', description: '5-digit DANE code.' })
  @IsString()
  daneCode: string;

  @ApiPropertyOptional({
    example: 'paez',
    description: 'Defaults to a slug suggested from the name.',
  })
  @IsOptional()
  @IsString()
  slug?: string;
}

export class UpdateMunicipalityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  state?: string;

  @ApiPropertyOptional({
    description: 'Immutable once the municipality has data.',
  })
  @IsOptional()
  @IsString()
  daneCode?: string;

  @ApiPropertyOptional({
    description: 'Immutable once the municipality has data.',
  })
  @IsOptional()
  @IsString()
  slug?: string;
}
