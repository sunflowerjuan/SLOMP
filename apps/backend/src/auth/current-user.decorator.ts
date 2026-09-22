import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './jwt.strategy.js';

// Reads the Administrator that JwtStrategy.validate() put on the request.
// Only usable on routes behind JwtAuthGuard (i.e. not @Public()).
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
