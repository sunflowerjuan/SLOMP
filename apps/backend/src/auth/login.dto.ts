import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@slomp.gov.co' })
  email: string;

  @ApiProperty({ example: 'change-me' })
  password: string;
}
