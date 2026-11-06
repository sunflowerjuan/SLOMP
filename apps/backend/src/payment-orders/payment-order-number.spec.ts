import { describe, expect, it } from 'vitest';
import {
  formatPaymentOrderNumber,
  reservePaymentOrderNumbers,
  type PaymentOrderCounterClient,
} from './payment-order-number.js';

class FakeCounterClient implements PaymentOrderCounterClient {
  private readonly counters = new Map<string, number>();

  paymentOrderCounter = {
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

describe('payment order numbers', () => {
  it('pads the sequence to four digits', () => {
    expect(formatPaymentOrderNumber(2026, 7)).toBe('2026-0007');
    expect(formatPaymentOrderNumber(2026, 12345)).toBe('2026-12345');
  });

  it('reserves a block of consecutive numbers starting at 1', async () => {
    const client = new FakeCounterClient();

    const numbers = await reservePaymentOrderNumbers(client, 1, 2026, 3);

    expect(numbers.map((n) => n.number)).toEqual([
      '2026-0001',
      '2026-0002',
      '2026-0003',
    ]);
    expect(numbers.map((n) => n.sequence)).toEqual([1, 2, 3]);
  });

  it('continues after the last reserved number without repeating', async () => {
    const client = new FakeCounterClient();

    await reservePaymentOrderNumbers(client, 1, 2026, 3);
    const next = await reservePaymentOrderNumbers(client, 1, 2026, 2);

    expect(next.map((n) => n.sequence)).toEqual([4, 5]);
  });

  it('restarts every year', async () => {
    const client = new FakeCounterClient();

    await reservePaymentOrderNumbers(client, 1, 2026, 4);
    const nextYear = await reservePaymentOrderNumbers(client, 1, 2027, 1);

    expect(nextYear[0]).toEqual({
      year: 2027,
      sequence: 1,
      number: '2027-0001',
    });
  });

  it('keeps an independent consecutive per municipality', async () => {
    const client = new FakeCounterClient();

    await reservePaymentOrderNumbers(client, 1, 2026, 5);
    const other = await reservePaymentOrderNumbers(client, 2, 2026, 1);
    const again = await reservePaymentOrderNumbers(client, 1, 2026, 1);

    expect(other[0]!.number).toBe('2026-0001');
    expect(again[0]!.number).toBe('2026-0006');
  });

  it('never repeats a number across concurrent reservations', async () => {
    const client = new FakeCounterClient();

    const blocks = await Promise.all(
      Array.from({ length: 20 }, () =>
        reservePaymentOrderNumbers(client, 1, 2026, 5),
      ),
    );
    const sequences = blocks.flat().map((n) => n.sequence);

    expect(new Set(sequences).size).toBe(100);
    expect(Math.max(...sequences)).toBe(100);
  });

  it.each([0, -1, 1.5])('rejects the count %s', async (count) => {
    await expect(
      reservePaymentOrderNumbers(new FakeCounterClient(), 1, 2026, count),
    ).rejects.toThrow();
  });

  it.each([0, -2026, 2026.5])('rejects the year %s', async (year) => {
    await expect(
      reservePaymentOrderNumbers(new FakeCounterClient(), 1, year, 1),
    ).rejects.toThrow();
  });
});
