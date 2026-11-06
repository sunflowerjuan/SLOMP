// Replaces identity document numbers in text the Administrator wrote before
// it is sent to the model: 6 to 10 digits after CC, CE, NIT, TI or PP
// ("CC 1234567890" -> "CC [DOC]"). Only these are detectable; a name typed
// by hand is not, which is why the chat asks not to write any.
const DOCUMENT_NUMBER =
  /\b(CC|CE|NIT|TI|PP)(\s*(?:[.:#-]|No\.?|N°|Nº)?\s*)\d{6,10}(?!\d)/gi;

export const MASKED_DOCUMENT = '[DOC]';

export function maskDocuments(text: string): string {
  return text.replace(
    DOCUMENT_NUMBER,
    (_match, kind: string, separator: string) =>
      `${kind}${separator}${MASKED_DOCUMENT}`,
  );
}
