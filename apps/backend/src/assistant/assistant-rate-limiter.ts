import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export const MESSAGES_PER_WINDOW = 20;
export const WINDOW_MS = 60_000;

export class AssistantRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      errorBody(
        ErrorCode.ASSISTANT_RATE_LIMITED,
        `At most ${MESSAGES_PER_WINDOW} messages per minute.`,
        { retryAfterSeconds },
      ),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// At most 20 messages per minute per Administrator, over a sliding window.
// Kept in memory: the backend runs as a single instance (one VPS), and a
// restart forgetting the count only gives back at most one minute.
@Injectable()
export class AssistantRateLimiter {
  private readonly sent = new Map<number, number[]>();
  // Replaced in tests.
  now: () => number = () => Date.now();

  // Counts one message for the Administrator, or throws when over the limit.
  consume(administratorId: number): void {
    const now = this.now();
    const recent = (this.sent.get(administratorId) ?? []).filter(
      (at) => now - at < WINDOW_MS,
    );
    if (recent.length >= MESSAGES_PER_WINDOW) {
      this.sent.set(administratorId, recent);
      throw new AssistantRateLimitedException(
        Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)),
      );
    }
    recent.push(now);
    this.sent.set(administratorId, recent);
  }
}
