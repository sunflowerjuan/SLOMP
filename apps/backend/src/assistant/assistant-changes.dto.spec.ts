import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  ConfirmStatusChangesDto,
  MAX_NOTE_LENGTH,
  StatusChangesDto,
} from './assistant-changes.dto.js';
import { MAX_CHANGES_PER_CALL } from './assistant-tools.service.js';

async function errorsOf<T extends object>(
  type: new () => T,
  body: unknown,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

const change = (settlementId: number, toStatus = 'PAGADA') => ({
  settlementId,
  toStatus,
});

describe('StatusChangesDto', () => {
  it('accepts between 1 and 100 distinct changes', async () => {
    expect(
      await errorsOf(StatusChangesDto, { changes: [change(1), change(2)] }),
    ).toEqual([]);
  });

  it.each([
    ['no changes', { changes: [] }],
    [
      'more than 100',
      {
        changes: Array.from({ length: MAX_CHANGES_PER_CALL + 1 }, (_, i) =>
          change(i + 1),
        ),
      },
    ],
    [
      'the same settlement twice',
      { changes: [change(1), change(1, 'PRESCRITA')] },
    ],
    ['a status that does not exist', { changes: [change(1, 'BORRADA')] }],
    ['an id that is not a positive integer', { changes: [change(-1)] }],
  ])('rejects %s', async (_label, body) => {
    expect(await errorsOf(StatusChangesDto, body)).toEqual(['changes']);
  });
});

describe('ConfirmStatusChangesDto', () => {
  it('takes an optional note of up to 500 characters', async () => {
    const changes = [change(1)];
    expect(await errorsOf(ConfirmStatusChangesDto, { changes })).toEqual([]);
    expect(
      await errorsOf(ConfirmStatusChangesDto, {
        changes,
        note: 'x'.repeat(MAX_NOTE_LENGTH),
      }),
    ).toEqual([]);
    expect(
      await errorsOf(ConfirmStatusChangesDto, {
        changes,
        note: 'x'.repeat(MAX_NOTE_LENGTH + 1),
      }),
    ).toEqual(['note']);
  });
});
