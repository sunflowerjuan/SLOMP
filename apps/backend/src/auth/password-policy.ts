import { isCommonPassword } from './common-passwords.js';

// Administrator password policy (security policy, section 4.3 and SEC-09):
// at least 12 characters, no forced composition rules, and not a common
// password. bcrypt only hashes the first 72 bytes; a longer password would be
// silently truncated, so it is rejected instead. Same rules as the seed and
// the admin scripts (packages/shared/src/security/password-policy.ts).
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

export type PasswordPolicyViolation = 'TOO_SHORT' | 'TOO_LONG' | 'COMMON';

export function checkPasswordPolicy(
  password: string,
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if ([...password].length < MIN_PASSWORD_LENGTH) violations.push('TOO_SHORT');
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    violations.push('TOO_LONG');
  }
  if (isCommonPassword(password)) violations.push('COMMON');
  return violations;
}
