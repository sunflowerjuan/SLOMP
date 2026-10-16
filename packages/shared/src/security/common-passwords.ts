// Common passwords for the password policy (security policy, section 4.3).
// Anything shorter than the 12-character minimum is already rejected, so
// only longer passwords are listed, plus the words people pad with digits or
// symbols to reach the minimum ("Password2026!", "admin1234567").

// Kept identical to apps/backend/src/auth/common-passwords.ts, which the
// password change endpoint uses (a backend test compares both).
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "1q2w3e4r5t6y",
  "1q2w3e4r5t6y7u",
  "q1w2e3r4t5y6",
  "1qaz2wsx3edc",
  "1qaz2wsx3edc4rfv",
  "zaq12wsxcde3",
  "qazwsxedcrfv",
  "1234qwerasdf",
  "qwer1234asdf",
  "abc123abc123",
  "a1b2c3d4e5f6",
  "112233445566",
  "11223344556677",
  "123123123123",
  "123412341234",
  "121212121212",
  "passwordpassword",
  "iloveyouiloveyou",
  "trabajodecampo",
  "changemechangeme",
]);

export const COMMON_WORDS: ReadonlySet<string> = new Set([
  "password",
  "passwd",
  "passw0rd",
  "p@ssw0rd",
  "p4ssw0rd",
  "pa$$word",
  "contraseña",
  "contrasena",
  "clave",
  "admin",
  "administrador",
  "administrator",
  "root",
  "usuario",
  "user",
  "login",
  "qwerty",
  "letmein",
  "welcome",
  "bienvenido",
  "bienvenida",
  "iloveyou",
  "teamo",
  "changeme",
  "cambiame",
  "secret",
  "secreto",
  "default",
  "colombia",
  "boyaca",
  "boyacá",
  "paez",
  "páez",
  "slomp",
  "predial",
  "impuesto",
  "alcaldia",
  "alcaldía",
  "hacienda",
  "tesoreria",
  "tesorería",
  "uptc",
  "monkey",
  "dragon",
  "football",
  "futbol",
  "fútbol",
  "superman",
  "princess",
  "sunshine",
  "master",
]);

// Runs people type as passwords: alphabet, keyboard rows, digits.
const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklñzxcvbnm",
  "qwertyuiopasdfghjklzxcvbnm",
  "01234567890123456789",
];

function isSequence(value: string): boolean {
  if (value.length < 6) return false;
  const reversed = [...value].reverse().join("");
  return SEQUENCES.some((s) => s.includes(value) || s.includes(reversed));
}

export function isCommonPassword(password: string): boolean {
  const normalized = password.normalize("NFC").toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) return true;
  // One character repeated ("aaaaaaaaaaaa", "111111111111").
  if (/^(.)\1*$/u.test(normalized)) return true;
  if (isSequence(normalized)) return true;

  // A common word or run padded with digits or symbols on either end.
  const core = normalized.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  return COMMON_WORDS.has(core) || isSequence(core);
}
