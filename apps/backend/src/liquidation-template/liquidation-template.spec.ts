import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { LiquidationTemplateData } from './liquidation-template-data.js';
import { loadTemplateFixture } from './test-fixture-docx.js';

describe('liquidacion-paez template', () => {
  it('renders template data without unresolved placeholders', () => {
    const template = loadTemplateFixture();
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
