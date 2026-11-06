import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@slomp.gov.co' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'change-me' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
