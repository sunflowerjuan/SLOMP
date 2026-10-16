import { isCommonPassword } from "./common-passwords.js";

// Administrator password policy (security policy, section 4.3 and SEC-09):
// at least 12 characters, no forced composition rules, and not a common
// password. bcrypt only hashes the first 72 bytes; a longer password would be
// silently truncated, so it is rejected instead.
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

export type PasswordPolicyViolation = "TOO_SHORT" | "TOO_LONG" | "COMMON";

export function checkPasswordPolicy(
  password: string,
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if ([...password].length < MIN_PASSWORD_LENGTH) violations.push("TOO_SHORT");
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    violations.push("TOO_LONG");
  }
  if (isCommonPassword(password)) violations.push("COMMON");
  return violations;
}

const VIOLATION_MESSAGES: Record<PasswordPolicyViolation, string> = {
  TOO_SHORT: `must have at least ${MIN_PASSWORD_LENGTH} characters`,
  TOO_LONG: `must not exceed ${MAX_PASSWORD_BYTES} bytes`,
  COMMON: "is a common password or a common word with digits or symbols",
};

export function describePasswordViolations(
  violations: PasswordPolicyViolation[],
): string {
  return violations.map((v) => `it ${VIOLATION_MESSAGES[v]}`).join("; ");
}
