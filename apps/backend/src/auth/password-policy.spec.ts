import { describe, expect, it } from 'vitest';
import { isCommonPassword } from './common-passwords.js';
import { checkPasswordPolicy } from './password-policy.js';

describe('isCommonPassword', () => {
  it.each([
    'passwordpassword',
    '1q2w3e4r5t6y',
    'trabajodecampo',
    'TrabajoDeCampo',
  ])('rejects a listed common password: %s', (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each([
    'Password2026!',
    'admin1234567',
    'Contraseña2026',
    '2026paez2026',
    '!!Colombia123',
    'P4ssw0rd2026',
    'pa$$word2026',
  ])('rejects a common word padded with digits or symbols: %s', (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each([
    'aaaaaaaaaaaa',
    '111111111111',
    '123456789012',
    '987654321098',
    'qwertyuiopas',
    'abcdefghijkl',
  ])('rejects repeated characters and sequences: %s', (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each([
    'una frase larga que nadie conoce',
    'cafe-mesa-rio-2026',
    'Paez2026Boyaca!',
  ])('accepts a password that is not common: %s', (password) => {
    expect(isCommonPassword(password)).toBe(false);
  });
});

describe('checkPasswordPolicy', () => {
  it('accepts a long password that is not common, with no composition rules', () => {
    expect(checkPasswordPolicy('una frase larga que nadie conoce')).toEqual([]);
    expect(checkPasswordPolicy('cafe mesa rio')).toEqual([]);
  });

  it('rejects a password shorter than 12 characters', () => {
    expect(checkPasswordPolicy('Kx9!mQ2#vL4')).toEqual(['TOO_SHORT']);
  });

  it('counts characters, not bytes, for the minimum', () => {
    expect(checkPasswordPolicy('ñandú y ñame')).toEqual([]);
  });

  it('rejects a password bcrypt would truncate', () => {
    expect(checkPasswordPolicy('kx9mq2vl4'.repeat(9))).toEqual(['TOO_LONG']);
  });

  it('rejects the seed development password on every count', () => {
    expect(checkPasswordPolicy('changeme123')).toEqual(['TOO_SHORT', 'COMMON']);
  });
});
