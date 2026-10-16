import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOWED_BEFORE_PASSWORD_CHANGE_KEY } from './allowed-before-password-change.decorator.js';
import type { AuthenticatedUser } from './jwt.strategy.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

// An Administrator whose password someone else chose can only replace it
// (security policy, 4.3): everything else waits for the new password.
export function assertPasswordChangeNotPending(
  user: Pick<AuthenticatedUser, 'mustChangePassword'>,
  routeAllowsPendingChange: boolean,
): void {
  if (user.mustChangePassword && !routeAllowsPendingChange) {
    throw new ForbiddenException(
      errorBody(
        ErrorCode.AUTH_PASSWORD_CHANGE_REQUIRED,
        'The password must be changed before using the API.',
      ),
    );
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (!(await super.canActivate(context))) {
      return false;
    }
    const user = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
    }>().user;
    assertPasswordChangeNotPending(
      user,
      this.reflector.getAllAndOverride<boolean>(
        ALLOWED_BEFORE_PASSWORD_CHANGE_KEY,
        targets,
      ) ?? false,
    );
    return true;
  }
}
