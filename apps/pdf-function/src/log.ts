const MAX_LOG_VALUE = 200;

// Caller-controlled values go through here before reaching a log line, so a
// CR/LF (or any other control character) can't forge an extra entry.
export function sanitizeForLog(value: string): string {
  return value.replaceAll(/[\p{Cc}\u2028\u2029]/gu, '').slice(0, MAX_LOG_VALUE);
}
