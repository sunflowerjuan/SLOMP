import { SetMetadata } from '@nestjs/common';

export const ALLOWED_BEFORE_PASSWORD_CHANGE_KEY = 'allowedBeforePasswordChange';

/**
 * Marks a protected route as usable by an Administrator who still has to
 * replace a password someone else chose (mustChangePassword). Every other
 * protected route answers 403 AUTH_PASSWORD_CHANGE_REQUIRED until then.
 */
export const AllowedBeforePasswordChange = () =>
  SetMetadata(ALLOWED_BEFORE_PASSWORD_CHANGE_KEY, true);
