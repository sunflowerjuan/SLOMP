// Reads the owner's document classification from the tax roll's "CCNIT"
// column (SL-75 / HU21). Business rule confirmed with the client:
//   - The classification is OPTIONAL. Some rows state it ("CC 40587912",
//     "NIT 900123456-1", "Cédula de extranjería 456789"); the rest don't,
//     and those owners are stored with no type (NULL).
//   - The type is NEVER deduced from the number's length, range or the
//     owner's name -- nothing is ever "CC by default".
//
// Pure domain logic: no Prisma import (Estándares de Código -- the domain
// layer must be testable without infrastructure). The codes mirror the
// `DocumentType` enum in schema.prisma, based on the DIAN document types.

export type DocumentTypeCode =
  | 'RC'
  | 'TI'
  | 'CC'
  | 'TE'
  | 'CE'
  | 'NIT'
  | 'PA'
  | 'TDE'
  | 'PEP'
  | 'PPT'
  | 'NUIP';

export interface ParsedOwnerDocument {
  // The document number without the classification label. Empty when the
  // cell only had a label (the caller treats that as a missing ID).
  documentId: string;
  documentType: DocumentTypeCode | null;
  // Set when the cell had text in front of the number that isn't a known
  // classification: the caller reports it instead of storing a made-up type.
  unrecognizedLabel: boolean;
}

// Labels as they may appear before the number, already upper-cased and
// without accents. A bare "CEDULA" is deliberately NOT here: it could be a
// CC or a CE, and guessing is exactly what the client ruled out.
const LABELS: Record<DocumentTypeCode, string[]> = {
  RC: ['RC', 'REGISTRO CIVIL'],
  TI: ['TI', 'TARJETA DE IDENTIDAD'],
  CC: ['CC', 'CEDULA DE CIUDADANIA', 'CEDULA CIUDADANIA'],
  TE: ['TE', 'TARJETA DE EXTRANJERIA'],
  CE: ['CE', 'CEDULA DE EXTRANJERIA', 'CEDULA EXTRANJERIA'],
  NIT: ['NIT'],
  PA: ['PA', 'PAS', 'PASAPORTE'],
  TDE: [
    'TDE',
    'DOCUMENTO EXTRANJERO',
    'DOCUMENTO DE IDENTIFICACION EXTRANJERO',
  ],
  PEP: ['PEP', 'PERMISO ESPECIAL DE PERMANENCIA'],
  PPT: ['PPT', 'PERMISO POR PROTECCION TEMPORAL'],
  NUIP: ['NUIP'],
};

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "CC" also matches "C.C." / "C. C."; multi-word labels allow any spacing.
function labelPattern(label: string): string {
  if (!label.includes(' ') && label.length <= 4) {
    return label
      .split('')
      .map((char) => `${escape(char)}\\.?`)
      .join('\\s?');
  }
  return label.split(' ').map(escape).join('\\s+');
}

// Longest labels first, so "CEDULA DE EXTRANJERIA" wins over "CE" and
// "PAS" over "PA". The label must be followed by a separator, a digit or
// the end -- "CEBALLOS 123" is not a CE.
const MATCHERS = (Object.entries(LABELS) as [DocumentTypeCode, string[]][])
  .flatMap(([type, labels]) => labels.map((label) => ({ type, label })))
  .sort((a, b) => b.label.length - a.label.length)
  .map(({ type, label }) => ({
    type,
    pattern: new RegExp(`^${labelPattern(label)}(?=$|[\\s.:#-]|\\d)`),
  }));

// Removes accents one character at a time, so indexes still line up with
// the original text (the number is sliced from the original, untouched).
function upperWithoutAccents(text: string): string {
  return [...text]
    .map((char) => char.normalize('NFD')[0] ?? char)
    .join('')
    .toUpperCase();
}

export function parseOwnerDocument(ccnit: string): ParsedOwnerDocument {
  const raw = ccnit.trim();
  const comparable = upperWithoutAccents(raw);

  for (const { type, pattern } of MATCHERS) {
    const match = pattern.exec(comparable);
    if (match) {
      const documentId = raw
        .slice(match[0].length)
        .replace(/^[\s.:#-]+/, '')
        .trim();
      return { documentId, documentType: type, unrecognizedLabel: false };
    }
  }

  // No known label: a plain number (the common case) has no type, and that's
  // fine. Letters we don't recognize are kept as-is but flagged.
  return {
    documentId: raw,
    documentType: null,
    unrecognizedLabel: /[A-Z]/.test(comparable),
  };
}
