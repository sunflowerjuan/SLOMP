import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  AssistantRateLimitedException,
  AssistantRateLimiter,
  MESSAGES_PER_WINDOW,
} from './assistant-rate-limiter.js';

describe('AssistantRateLimiter', () => {
  it(`allows ${MESSAGES_PER_WINDOW} messages per minute per Administrator and answers 429 to the next`, () => {
    const limiter = new AssistantRateLimiter();
    let now = 1_000_000;
    limiter.now = () => now;

    for (let i = 0; i < MESSAGES_PER_WINDOW; i++) {
      limiter.consume(1);
      now += 1000;
    }
    const error = (() => {
      try {
        limiter.consume(1);
      } catch (caught) {
        return caught;
      }
    })() as AssistantRateLimitedException;

    expect(error).toBeInstanceOf(AssistantRateLimitedException);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_RATE_LIMITED,
    });
    // The first message leaves the window 60 s after it was sent.
    expect(error.retryAfterSeconds).toBe(40);
    // Another Administrator has their own budget.
    expect(() => limiter.consume(2)).not.toThrow();
  });

  it('allows messages again as the old ones leave the window', () => {
    const limiter = new AssistantRateLimiter();
    let now = 0;
    limiter.now = () => now;
    for (let i = 0; i < MESSAGES_PER_WINDOW; i++) limiter.consume(1);
    expect(() => limiter.consume(1)).toThrow(AssistantRateLimitedException);

    now += 60_000;
    expect(() => limiter.consume(1)).not.toThrow();
  });
});
