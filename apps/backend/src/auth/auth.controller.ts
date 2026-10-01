import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './login.dto.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Autentica a un funcionario administrador y emite un JWT.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description:
      'Credenciales válidas. Devuelve el JWT a usar como Bearer token en el resto de la API.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Falta "email" o "password" (o no son strings) en el body.',
  })
  @ApiResponse({
    status: 401,
    description:
      'El email no corresponde a un administrador registrado, o la contraseña no coincide.',
  })
  login(@Body() body: LoginDto) {
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      throw new BadRequestException('You must provide "email" and "password".');
    }
    return this.authService.login(body.email, body.password);
  }
}
