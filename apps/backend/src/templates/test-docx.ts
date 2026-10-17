import PizZip from 'pizzip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Test helper: a minimal but well-formed .docx. Each paragraph is a list of
// runs, so a marker can be split across runs the way Word does it.
export function buildDocx(
  paragraphs: (string | string[])[],
  extraFiles: Record<string, string> = {},
): Buffer {
  const run = (text: string) =>
    `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
  const paragraph = (runs: string | string[]) =>
    `<w:p>${[runs].flat().map(run).join('')}</w:p>`;

  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${paragraphs
      .map(paragraph)
      .join('')}</w:body></w:document>`,
  );
  for (const [name, content] of Object.entries(extraFiles)) {
    zip.file(name, content);
  }
  return zip.generate({ type: 'nodebuffer' });
}

// Every marker of the liquidation catalog, as the official Páez template
// uses them (a section on owners, a loop on rows).
export const LIQUIDATION_PARAGRAPHS: string[] = [
  'RESOLUCION N° LOIP 15514{resolutionNumber}',
  'numero {cadastralCode} en {propertyName}{#owners} a nombre de {owners}{/owners}.',
  'vigencias {startYear} a {endYear} total {totalAmount} capital {capitalAmount} interes {interestAmount}',
  '{#rows}{year} {concept} {interest} {capital} {/rows}',
];

// Every marker of the payment order catalog, as the Páez template uses them
// (the liquidations it refers to are an inline loop).
export const PAYMENT_ORDER_PARAGRAPHS: string[] = [
  'RESOLUCION N° MP 15514{paymentOrderNumber} {issueDate}',
  'liquidaciones {#liquidations}LOIP 15514{number}{separator}{/liquidations}',
  'numero {cadastralCode} en {propertyName}{#owners} a nombre de {owners}{/owners}.',
  'vigencias {startYear} a {endYear} capital {capitalAmount}',
];
