import { describe, expect, it } from 'vitest';
import {
  formatResolutionNumber,
  reserveResolutionNumber,
  type ResolutionCounterClient,
} from './reserve-resolution-number.js';

class FakeCounterClient implements ResolutionCounterClient {
  private readonly counters = new Map<number, number>();

  resolutionCounter = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { year: number };
      create: { year: number; lastSequence: number };
      update: { lastSequence: { increment: number } };
      select: { lastSequence: true };
    }) => {
      const lastSequence = this.counters.has(where.year)
        ? this.counters.get(where.year)! + update.lastSequence.increment
        : create.lastSequence;
      this.counters.set(where.year, lastSequence);
      return { lastSequence };
    },
  };
}

describe('resolution number reservation', () => {
  it('pads sequences to at least four digits', () => {
    expect(formatResolutionNumber(2026, 42)).toBe('2026-0042');
  });

  it('supports sequences above four digits', () => {
    expect(formatResolutionNumber(2026, 12345)).toBe('2026-12345');
  });

  it('reserves the first number and increments subsequent reservations', async () => {
    const client = new FakeCounterClient();

    await expect(reserveResolutionNumber(client, 2026)).resolves.toEqual({
      year: 2026,
      sequence: 1,
      number: '2026-0001',
    });
    await expect(reserveResolutionNumber(client, 2026)).resolves.toEqual({
      year: 2026,
      sequence: 2,
      number: '2026-0002',
    });
  });

  it('starts an independent sequence for each year', async () => {
    const client = new FakeCounterClient();

    await reserveResolutionNumber(client, 2026);
    await expect(reserveResolutionNumber(client, 2027)).resolves.toMatchObject({
      year: 2027,
      sequence: 1,
      number: '2027-0001',
    });
  });

  it('returns distinct numbers for concurrent reservations', async () => {
    const client = new FakeCounterClient();
    const results = await Promise.all(
      Array.from({ length: 50 }, () => reserveResolutionNumber(client, 2026)),
    );

    expect(new Set(results.map(({ sequence }) => sequence)).size).toBe(50);
    expect(
      results.map(({ sequence }) => sequence).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });

  it('rejects non-positive or non-integer years and sequences', async () => {
    for (const value of [0, -1, 1.5]) {
      expect(() => formatResolutionNumber(value, 1)).toThrow();
      await expect(
        reserveResolutionNumber(new FakeCounterClient(), value),
      ).rejects.toThrow();
      expect(() => formatResolutionNumber(2026, value)).toThrow();
    }
  });
});
