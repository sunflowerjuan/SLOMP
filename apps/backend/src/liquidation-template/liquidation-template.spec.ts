import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { LiquidationTemplateData } from './liquidation-template-data.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const templatePath = resolve(process.cwd(), 'templates/liquidacion-paez.docx');

// The official template is client material and is not versioned: use it when it is
// present locally, otherwise a minimal docx with the same placeholders (keeps CI green).
function loadTemplate(): Buffer {
  if (existsSync(templatePath)) return readFileSync(templatePath);
  const paragraph = (text: string) =>
    `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
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

describe('liquidacion-paez template', () => {
  it('renders template data without unresolved placeholders', () => {
    const template = loadTemplate();
    const values: LiquidationTemplateData = {
      resolutionNumber: '2026-0042',
      cadastralCode: '155140001000000010019000000000',
      propertyName: 'LA FORTUNA VDA EL OSO',
      owners: 'NELLY PINEDA PENA, MARIA LOPEZ',
      startYear: '2022',
      endYear: '2026',
      totalAmount: '$ 664.798',
      capitalAmount: '$ 605.454',
      interestAmount: '$ 59.344',
      rows: [
        {
          year: '2024',
          concept: 'IMPUESTO PREDIAL',
          interest: '$ 10.000',
          capital: '$ 100.000',
        },
        {
          year: '2025',
          concept: 'SOBRETASA AMBIENTAL',
          interest: '$ 2.000',
          capital: '$ 20.000',
        },
      ],
    };

    const render = (data: LiquidationTemplateData) => {
      const zip = new PizZip(template);
      const document = new Docxtemplater(zip, { paragraphLoop: true });
      document.render(data);
      const xml = document.getZip().file('word/document.xml')!.asText();
      // Only visible text: attributes can hold legit braces (OOXML extension GUIDs).
      return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
        .map((match) => match[1])
        .join('');
    };
    const rendered = render(values);
    expect(rendered).not.toMatch(/[{}]/);
    for (const value of [
      '2026-0042',
      '155140001000000010019000000000',
      'LA FORTUNA VDA EL OSO',
      'NELLY PINEDA PENA, MARIA LOPEZ',
      '2022',
      '2026',
      '$ 664.798',
      'SOBRETASA AMBIENTAL',
      '100.000',
    ]) {
      expect(rendered).toContain(value);
    }

    const withoutOwners = render({ ...values, owners: '' });
    expect(withoutOwners).not.toMatch(/[{}]/);
    expect(withoutOwners).not.toContain('a nombre de');
  });
});
