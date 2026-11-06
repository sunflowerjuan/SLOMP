import { describe, expect, it } from 'vitest';
import {
  formatResolutionNumber,
  reserveResolutionNumber,
  type ResolutionCounterClient,
} from './reserve-resolution-number.js';

class FakeCounterClient implements ResolutionCounterClient {
  private readonly counters = new Map<string, number>();

  resolutionCounter = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { municipalityId_year: { municipalityId: number; year: number } };
      create: { municipalityId: number; year: number; lastSequence: number };
      update: { lastSequence: { increment: number } };
      select: { lastSequence: true };
    }) => {
      const key = `${where.municipalityId_year.municipalityId}:${where.municipalityId_year.year}`;
      const lastSequence = this.counters.has(key)
        ? this.counters.get(key)! + update.lastSequence.increment
        : create.lastSequence;
      this.counters.set(key, lastSequence);
      return { lastSequence };
    },
  };
}

const MUNICIPALITY_ID = 1;
const OTHER_MUNICIPALITY_ID = 2;

describe('resolution number reservation', () => {
  it('pads sequences to at least four digits', () => {
    expect(formatResolutionNumber(2026, 42)).toBe('2026-0042');
  });

  it('supports sequences above four digits', () => {
    expect(formatResolutionNumber(2026, 12345)).toBe('2026-12345');
  });

  it('reserves the first number and increments subsequent reservations', async () => {
    const client = new FakeCounterClient();

    await expect(
      reserveResolutionNumber(client, MUNICIPALITY_ID, 2026),
    ).resolves.toEqual({
      year: 2026,
      sequence: 1,
      number: '2026-0001',
    });
    await expect(
      reserveResolutionNumber(client, MUNICIPALITY_ID, 2026),
    ).resolves.toEqual({
      year: 2026,
      sequence: 2,
      number: '2026-0002',
    });
  });

  it('starts an independent sequence for each year', async () => {
    const client = new FakeCounterClient();

    await reserveResolutionNumber(client, MUNICIPALITY_ID, 2026);
    await expect(
      reserveResolutionNumber(client, MUNICIPALITY_ID, 2027),
    ).resolves.toMatchObject({
      year: 2027,
      sequence: 1,
      number: '2027-0001',
    });
  });

  it('keeps an independent consecutive per municipality: each one has its own 2026-0001', async () => {
    const client = new FakeCounterClient();

    await reserveResolutionNumber(client, MUNICIPALITY_ID, 2026);
    await reserveResolutionNumber(client, MUNICIPALITY_ID, 2026);

    await expect(
      reserveResolutionNumber(client, OTHER_MUNICIPALITY_ID, 2026),
    ).resolves.toMatchObject({ sequence: 1, number: '2026-0001' });
    await expect(
      reserveResolutionNumber(client, MUNICIPALITY_ID, 2026),
    ).resolves.toMatchObject({ sequence: 3, number: '2026-0003' });
  });

  it('returns distinct numbers for concurrent reservations', async () => {
    const client = new FakeCounterClient();
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        reserveResolutionNumber(client, MUNICIPALITY_ID, 2026),
      ),
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
        reserveResolutionNumber(
          new FakeCounterClient(),
          MUNICIPALITY_ID,
          value,
        ),
      ).rejects.toThrow();
      expect(() => formatResolutionNumber(2026, value)).toThrow();
    }
  });
});
