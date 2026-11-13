import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SL-131: the `reporting` schema is read by Power BI and must never expose
// personal data. Reads the migration itself, so no database is needed.
const MIGRATION = new URL(
  '../../../../packages/shared/prisma/migrations/20261112120000_reporting_schema/migration.sql',
  import.meta.url,
);

const FORBIDDEN = [
  'cadastral_code',
  'address',
  'owner',
  'document',
  'administrator',
  'email',
];

// Forbidden names appearing as an identifier, in any quoting, outside comments.
function forbiddenColumns(sql: string): string[] {
  const code = sql.replaceAll(/--.*$/gm, '').toLowerCase();
  return FORBIDDEN.filter((name) =>
    new RegExp(String.raw`\b${name}\b`).test(code),
  );
}

describe('reporting schema migration', () => {
  it('has no column that identifies a person or a property', () => {
    expect(forbiddenColumns(readFileSync(MIGRATION, 'utf8'))).toEqual([]);
  });

  it('detects a forbidden column (self-check of the rule)', () => {
    expect(
      forbiddenColumns('SELECT p."address" AS "address" FROM properties p'),
    ).toEqual(['address']);
  });
});
