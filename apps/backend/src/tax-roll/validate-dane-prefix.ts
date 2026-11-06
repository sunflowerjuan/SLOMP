import { DANE_CODE_LENGTH } from '../municipalities/municipality-rules.js';

export interface DanePrefixCount {
  prefix: string;
  rows: number;
}

export interface DanePrefixCheck {
  matches: boolean;
  // Rows whose cadastral code does not start with the expected DANE code.
  mismatchedRows: number;
  // The prefixes found on those rows, most frequent first.
  foundPrefixes: DanePrefixCount[];
}

// Cadastral codes start with the 5-digit DANE code of their municipality, so
// a file for another municipality is detectable before anything is saved. A
// pure function on purpose: the tax roll upload and the payment order upload
// share it.
export function checkCadastralDanePrefix(
  cadastralCodes: readonly string[],
  daneCode: string,
): DanePrefixCheck {
  const countByPrefix = new Map<string, number>();
  let mismatchedRows = 0;

  for (const code of cadastralCodes) {
    if (code.startsWith(daneCode)) continue;
    mismatchedRows++;
    const prefix = code.slice(0, DANE_CODE_LENGTH);
    countByPrefix.set(prefix, (countByPrefix.get(prefix) ?? 0) + 1);
  }

  return {
    matches: mismatchedRows === 0,
    mismatchedRows,
    foundPrefixes: [...countByPrefix.entries()]
      .map(([prefix, rows]) => ({ prefix, rows }))
      .sort((a, b) => b.rows - a.rows || a.prefix.localeCompare(b.prefix)),
  };
}
