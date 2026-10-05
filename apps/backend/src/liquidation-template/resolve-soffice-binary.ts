import { existsSync } from 'node:fs';

// Resolved from a fixed, hardcoded list of install locations -- never by
// letting child_process search the ambient PATH, which could point at a
// writable (attacker-controlled) directory. Override with LIBREOFFICE_BIN
// for a deployment where soffice lives somewhere else.
const KNOWN_SOFFICE_PATHS = [
  '/usr/bin/soffice', // Debian/Ubuntu (apt), most Linux containers
  '/usr/local/bin/soffice', // Homebrew on Intel macOS, some Linux installs
  '/opt/homebrew/bin/soffice', // Homebrew on Apple Silicon macOS
  '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS app bundle
];

export function resolveSofficeBinary(
  candidatePaths: readonly string[] = KNOWN_SOFFICE_PATHS,
): string {
  const override = process.env.LIBREOFFICE_BIN;
  if (override) return override;

  const found = candidatePaths.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      'soffice not found in any known location. Set LIBREOFFICE_BIN to its absolute path.',
    );
  }
  return found;
}
