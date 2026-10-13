// Temporary lockout after repeated failed logins, tracked per email and per
// client IP (security policy, section 4.3).
export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;

// The policy asks for a growing lockout without fixing its length, so these
// are provisional: every consecutive lockout doubles, up to the cap.
export const BASE_LOCKOUT_MS = 15 * 60_000;
export const MAX_LOCKOUT_MS = 60 * 60_000;

// Upper bound on tracked keys, so a flood of made-up emails can't grow the
// map without limit.
const MAX_TRACKED_KEYS = 10_000;

interface AttemptRecord {
  // Timestamps of the failures still inside the window.
  failures: number[];
  lockedUntil: number;
  // How many lockouts in a row this key has earned.
  lockouts: number;
  lastActivity: number;
}

export function lockoutDurationMs(previousLockouts: number): number {
  return Math.min(BASE_LOCKOUT_MS * 2 ** previousLockouts, MAX_LOCKOUT_MS);
}

export function loginAttemptKeys(email: string, ip: string): string[] {
  return [`email:${email.trim().toLowerCase()}`, `ip:${ip}`];
}

// ponytail: In-memory counts are per instance; use shared storage such as Redis only when scaling out.
export class LoginAttemptTracker {
  private readonly records = new Map<string, AttemptRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  isLocked(keys: readonly string[]): boolean {
    const now = this.now();
    return keys.some((key) => (this.records.get(key)?.lockedUntil ?? 0) > now);
  }

  registerFailure(keys: readonly string[]): void {
    const now = this.now();
    this.prune(now);

    for (const key of keys) {
      const known = this.records.get(key);
      const record =
        known && !isStale(known, now)
          ? known
          : { failures: [], lockedUntil: 0, lockouts: 0, lastActivity: now };
      record.failures = record.failures.filter(
        (failedAt) => now - failedAt < FAILURE_WINDOW_MS,
      );
      record.failures.push(now);
      record.lastActivity = now;

      if (record.failures.length >= MAX_FAILED_ATTEMPTS) {
        record.lockedUntil = now + lockoutDurationMs(record.lockouts);
        record.lockouts += 1;
        record.failures = [];
      }
      this.records.set(key, record);
    }
  }

  registerSuccess(keys: readonly string[]): void {
    for (const key of keys) {
      this.records.delete(key);
    }
  }

  private prune(now: number): void {
    if (this.records.size < MAX_TRACKED_KEYS) return;
    for (const [key, record] of this.records) {
      if (isStale(record, now)) this.records.delete(key);
    }
  }
}

// A key starts over (lockout growth included) once it has been unlocked and
// quiet for as long as the longest lockout.
function isStale(record: AttemptRecord, now: number): boolean {
  const quietSince = Math.max(record.lockedUntil, record.lastActivity);
  return now - quietSince >= MAX_LOCKOUT_MS;
}
