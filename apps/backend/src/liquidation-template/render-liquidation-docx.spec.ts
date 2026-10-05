import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiquidationTemplateData } from './liquidation-template-data.js';
import { renderLiquidationDocx } from './render-liquidation-docx.js';
import { loadTemplateFixture } from './test-fixture-docx.js';

const DATA: LiquidationTemplateData = {
  resolutionNumber: '2026-0042',
  cadastralCode: '155140001000000010019000000000',
  propertyName: 'LA FORTUNA VDA EL OSO',
  owners: 'NELLY PINEDA PENA',
  startYear: '2024',
  endYear: '2024',
  totalAmount: '$ 110.000',
  capitalAmount: '$ 100.000',
  interestAmount: '$ 10.000',
  rows: [
    {
      year: '2024',
      concept: 'IMPUESTO PREDIAL',
      interest: '$ 10.000',
      capital: '$ 100.000',
    },
  ],
};

let tmpDir: string;

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('renderLiquidationDocx', () => {
  it('returns a rendered docx buffer with no unresolved placeholders', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'liquidation-template-'));
    const templatePath = join(tmpDir, 'template.docx');
    writeFileSync(templatePath, loadTemplateFixture());

    const result = renderLiquidationDocx(DATA, templatePath);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('throws a clear error when the template file is missing', () => {
    expect(() =>
      renderLiquidationDocx(DATA, '/nonexistent/path/liquidacion-paez.docx'),
    ).toThrow(/template not found/i);
  });
});
