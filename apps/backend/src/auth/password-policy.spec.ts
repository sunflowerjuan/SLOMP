import { describe, expect, it } from 'vitest';
import * as sharedList from '../../../../packages/shared/src/security/common-passwords.js';
import * as sharedPolicy from '../../../../packages/shared/src/security/password-policy.js';
import { COMMON_PASSWORDS, COMMON_WORDS } from './common-passwords.js';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  checkPasswordPolicy,
} from './password-policy.js';

const SAMPLES = [
  'una frase larga que nadie conoce',
  'cafe mesa rio',
  'Paez2026Boyaca!',
  'Password2026!',
  'admin1234567',
  'Contraseña2026',
  'TrabajoDeCampo',
  '123456789012',
  'qwertyuiopas',
  'aaaaaaaaaaaa',
  'changeme123',
  'Kx9!mQ2#vL4',
  'ñandú y ñame',
  'kx9mq2vl4'.repeat(9),
];

describe('checkPasswordPolicy', () => {
  it('accepts a long password that is not common, with no composition rules', () => {
    expect(checkPasswordPolicy('una frase larga que nadie conoce')).toEqual([]);
    expect(checkPasswordPolicy('cafe mesa rio')).toEqual([]);
  });

  it('rejects short, too long and common passwords', () => {
    expect(checkPasswordPolicy('Kx9!mQ2#vL4')).toEqual(['TOO_SHORT']);
    expect(checkPasswordPolicy('kx9mq2vl4'.repeat(9))).toEqual(['TOO_LONG']);
    expect(checkPasswordPolicy('Password2026!')).toEqual(['COMMON']);
    expect(checkPasswordPolicy('changeme123')).toEqual(['TOO_SHORT', 'COMMON']);
  });
});

// The seed and the admin scripts apply packages/shared's copy; both must
// accept and reject exactly the same passwords.
describe('same policy as packages/shared', () => {
  it('uses the same limits and lists', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(sharedPolicy.MIN_PASSWORD_LENGTH);
    expect(MAX_PASSWORD_BYTES).toBe(sharedPolicy.MAX_PASSWORD_BYTES);
    expect([...COMMON_PASSWORDS].sort()).toEqual(
      [...sharedList.COMMON_PASSWORDS].sort(),
    );
    expect([...COMMON_WORDS].sort()).toEqual(
      [...sharedList.COMMON_WORDS].sort(),
    );
  });

  it.each(SAMPLES)('gives the same verdict for "%s"', (password) => {
    expect(checkPasswordPolicy(password)).toEqual(
      sharedPolicy.checkPasswordPolicy(password),
    );
  });
});
