import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const REAL_TEMPLATE_PATH = resolve(
  process.cwd(),
  'templates/liquidacion-paez.docx',
);

// The official template is client material and is not versioned: use it when
// it is present locally, otherwise a minimal docx with the same placeholders
// (keeps CI green). Shared by every spec that needs a renderable template.
export function loadTemplateFixture(): Buffer {
  if (existsSync(REAL_TEMPLATE_PATH)) return readFileSync(REAL_TEMPLATE_PATH);
  const paragraph = (text: string) =>
    `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  // Required for real OOXML consumers (LibreOffice, Word) to even locate the
  // main document part -- docxtemplater's own zip reader doesn't need this,
  // which is why the original fixture (missing it) still passed the render
  // spec but failed a real soffice conversion.
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${[
      'RESOLUCION N° LOIP 15514{resolutionNumber}',
      'numero {cadastralCode} ubicado en {propertyName}{#owners} a nombre de {owners}{/owners}.',
      'vigencias {startYear} a {endYear} total {totalAmount} capital {capitalAmount} interes {interestAmount}',
      '{#rows}{year} {concept} {interest} {capital} {/rows}',
    ]
      .map(paragraph)
      .join('')}</w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer' });
}
