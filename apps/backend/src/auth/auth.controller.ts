import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './login.dto.js';
import { Public } from './public.decorator.js';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      throw new BadRequestException('You must provide "email" and "password".');
    }
    return this.authService.login(body.email, body.password);
  }
}
