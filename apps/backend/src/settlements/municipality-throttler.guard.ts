import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Rate limits of the public consultation are counted per municipality AND per
// client: each municipality's iframe has its own budget, so heavy use (or
// abuse) of one never eats into another's, and a single visitor can't lock
// the municipality's other citizens out. The slug is bounded because an
// unknown slug is still a valid tracker key.
const MAX_SLUG_LENGTH = 64;

@Injectable()
export class MunicipalityThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const params = req.params as { slug?: unknown } | undefined;
    const slug = String(params?.slug ?? '')
      .toLowerCase()
      .slice(0, MAX_SLUG_LENGTH);
    return Promise.resolve(`${slug}:${String(req.ip)}`);
  }
}
