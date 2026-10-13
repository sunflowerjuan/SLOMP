import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './login.dto.js';
import { Public } from './public.decorator.js';
import {
  clearRefreshCookie,
  isTrustedOrigin,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import type { IssuedSession } from './session.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

const SESSION_EXAMPLE = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  expiresIn: 900,
  idleTimeoutSeconds: 1800,
  sessionExpiresAt: '2026-10-13T22:00:00.000Z',
};

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary:
      'Autentica a un funcionario administrador, emite un JWT de corta duración y deja el refresh token en una cookie httpOnly.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description:
      'Credenciales válidas. Devuelve el JWT a usar como Bearer token en el resto de la API y los tiempos de la sesión.',
    schema: { example: SESSION_EXAMPLE },
  })
  @ApiResponse({
    status: 400,
    description: 'Falta "email" o "password" (o no son strings) en el body.',
  })
  @ApiResponse({
    status: 401,
    description:
      'El email no corresponde a un administrador registrado, o la contraseña no coincide. Tras 5 fallos en 15 minutos (por email o por IP) el login se bloquea temporalmente y responde este mismo error.',
  })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      throw new BadRequestException(
        errorBody(
          ErrorCode.AUTH_CREDENTIALS_REQUIRED,
          'You must provide "email" and "password".',
        ),
      );
    }
    const session = await this.authService.login(
      body.email,
      body.password,
      request.ip ?? 'unknown',
    );
    return respondWithSession(response, session);
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Renueva la sesión con el refresh token de la cookie: entrega un JWT nuevo y rota la cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión renovada.',
    schema: { example: SESSION_EXAMPLE },
  })
  @ApiResponse({
    status: 401,
    description:
      'No hay cookie, o el refresh token venció, fue revocado o ya se había usado (en ese caso se cierra toda la sesión).',
  })
  @ApiResponse({
    status: 403,
    description: 'La petición viene de un origen que no está en CORS_ORIGIN.',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedOrigin(request);
    try {
      const session = await this.authService.refresh(
        readRefreshCookie(request),
      );
      return respondWithSession(response, session);
    } catch (error) {
      clearRefreshCookie(response);
      throw error;
    }
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Cierra la sesión: revoca sus refresh tokens, invalida los JWT emitidos para ella y borra la cookie.',
  })
  @ApiResponse({
    status: 204,
    description: 'Sesión cerrada (o no había ninguna abierta).',
  })
  @ApiResponse({
    status: 403,
    description: 'La petición viene de un origen que no está en CORS_ORIGIN.',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedOrigin(request);
    await this.authService.logout(readRefreshCookie(request));
    clearRefreshCookie(response);
  }
}

function assertTrustedOrigin(request: Request): void {
  if (!isTrustedOrigin(request)) {
    throw new ForbiddenException(
      errorBody(ErrorCode.FORBIDDEN, 'Origin not allowed.'),
    );
  }
}

// The refresh token goes in the cookie; the body carries everything else.
function respondWithSession(response: Response, session: IssuedSession) {
  const { refreshToken, refreshTokenExpiresAt, ...body } = session;
  setRefreshCookie(response, refreshToken, refreshTokenExpiresAt);
  return body;
}
