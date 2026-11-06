import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'la-contraseña-actual' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    example: 'una frase larga que nadie más conoce',
    description:
      'Mínimo 12 caracteres, sin reglas de composición, que no sea una contraseña común y distinta de la actual.',
  })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
