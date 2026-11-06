import { describe, expect, it } from 'vitest';
import {
  BASE_LOCKOUT_MS,
  FAILURE_WINDOW_MS,
  LoginAttemptTracker,
  MAX_FAILED_ATTEMPTS,
  MAX_LOCKOUT_MS,
  lockoutDurationMs,
  loginAttemptKeys,
} from './login-attempt-tracker.js';

function buildTracker() {
  const clock = { now: 0 };
  const tracker = new LoginAttemptTracker(() => clock.now);
  const fail = (keys: string[], times = MAX_FAILED_ATTEMPTS) => {
    for (let attempt = 0; attempt < times; attempt += 1) {
      tracker.registerFailure(keys);
    }
  };
  return { clock, tracker, fail };
}

describe('loginAttemptKeys', () => {
  it('tracks the email ignoring case and surrounding spaces', () => {
    expect(loginAttemptKeys(' Admin@Example.com ', '198.51.100.1')).toEqual([
      'email:admin@example.com',
      'ip:198.51.100.1',
    ]);
  });
});

describe('lockoutDurationMs', () => {
  it('doubles with every consecutive lockout up to the cap', () => {
    expect(lockoutDurationMs(0)).toBe(BASE_LOCKOUT_MS);
    expect(lockoutDurationMs(1)).toBe(BASE_LOCKOUT_MS * 2);
    expect(lockoutDurationMs(2)).toBe(MAX_LOCKOUT_MS);
    expect(lockoutDurationMs(10)).toBe(MAX_LOCKOUT_MS);
  });
});

describe('LoginAttemptTracker', () => {
  it('stays unlocked below the failure limit', () => {
    const { tracker, fail } = buildTracker();

    fail(['email:a'], MAX_FAILED_ATTEMPTS - 1);

    expect(tracker.isLocked(['email:a'])).toBe(false);
  });

  it('locks a key once it reaches the failure limit', () => {
    const { tracker, fail } = buildTracker();

    fail(['email:a']);

    expect(tracker.isLocked(['email:a'])).toBe(true);
  });

  it('locks by email and by IP independently', () => {
    const { tracker, fail } = buildTracker();

    fail(['email:a', 'ip:1']);

    expect(tracker.isLocked(['email:a', 'ip:2'])).toBe(true);
    expect(tracker.isLocked(['email:b', 'ip:1'])).toBe(true);
    expect(tracker.isLocked(['email:b', 'ip:2'])).toBe(false);
  });

  it('only counts the failures inside the window', () => {
    const { clock, tracker, fail } = buildTracker();

    fail(['email:a'], MAX_FAILED_ATTEMPTS - 1);
    clock.now += FAILURE_WINDOW_MS;
    fail(['email:a'], 1);

    expect(tracker.isLocked(['email:a'])).toBe(false);
  });

  it('unlocks when the lockout expires', () => {
    const { clock, tracker, fail } = buildTracker();

    fail(['email:a']);
    clock.now += BASE_LOCKOUT_MS - 1;
    expect(tracker.isLocked(['email:a'])).toBe(true);

    clock.now += 1;
    expect(tracker.isLocked(['email:a'])).toBe(false);
  });

  it('doubles the lockout when the key gets locked again right after', () => {
    const { clock, tracker, fail } = buildTracker();

    fail(['email:a']);
    clock.now += BASE_LOCKOUT_MS;
    fail(['email:a']);

    clock.now += BASE_LOCKOUT_MS * 2 - 1;
    expect(tracker.isLocked(['email:a'])).toBe(true);
    clock.now += 1;
    expect(tracker.isLocked(['email:a'])).toBe(false);
  });

  it('starts over from the base lockout after a long quiet period', () => {
    const { clock, tracker, fail } = buildTracker();

    fail(['email:a']);
    clock.now += BASE_LOCKOUT_MS + MAX_LOCKOUT_MS;
    fail(['email:a']);

    clock.now += BASE_LOCKOUT_MS;
    expect(tracker.isLocked(['email:a'])).toBe(false);
  });

  it('forgets the failures of a key after a successful login', () => {
    const { tracker, fail } = buildTracker();

    fail(['email:a', 'ip:1'], MAX_FAILED_ATTEMPTS - 1);
    tracker.registerSuccess(['email:a', 'ip:1']);
    fail(['email:a', 'ip:1'], MAX_FAILED_ATTEMPTS - 1);

    expect(tracker.isLocked(['email:a', 'ip:1'])).toBe(false);
  });
});
