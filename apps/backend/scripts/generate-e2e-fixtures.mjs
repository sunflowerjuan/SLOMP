// Fictional tax roll Excel files for the Playwright suite (apps/e2e, SL-165).
// Names, documents and amounts are invented; cadastral codes use the DANE code
// of the e2e-prueba municipality (99999). Output: apps/e2e/fixtures/generated/
// (git-ignored). Run: pnpm --filter backend run e2e:fixtures
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const HEADERS = [
  'Cédula Catastral',
  'Destino',
  'Avaluo',
  'CCNIT',
  'Propietario',
  'Nombre Predio',
  'periodo',
  'Impuesto Predial',
  'Interes Impuesto Predial',
  'C.A.R.',
  'Interes C.A.R.',
  'Sobretasa Bomberil',
  'Interes Sobretasa Bomberil',
  'Total',
];

const PROPERTIES = [
  [
    '999990001000000010001',
    'Rural',
    'CC 10000001',
    'Propietario Prueba Uno',
    'Lote de Prueba 1',
    50000000,
  ],
  [
    '999990001000000020001',
    'Rural',
    'CC 10000002',
    'Propietario Prueba Dos',
    'Lote de Prueba 2',
    80000000,
  ],
  [
    '999990002000010000001',
    'Urbano',
    'NIT 900000001-1',
    'Empresa Ficticia S.A.S.',
    'Casa de Prueba 3',
    120000000,
  ],
];
const PERIODS = [2024, 2025];

function rows() {
  return PROPERTIES.flatMap(([code, use, doc, owner, name, appraisal]) =>
    PERIODS.map((period) => {
      const tax = appraisal / 100;
      const car = tax * 0.02;
      const fire = tax * 0.05;
      return [
        code,
        use,
        appraisal,
        doc,
        owner,
        name,
        period,
        tax,
        0,
        car,
        0,
        fire,
        0,
        tax + car + fire,
      ];
    }),
  );
}

async function write(path, headers) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cartera');
  sheet.addRow(headers);
  rows().forEach((row) => sheet.addRow(row));
  await workbook.xlsx.writeFile(path);
  console.log(`Written ${path}`);
}

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../e2e/fixtures/generated',
);
mkdirSync(outDir, { recursive: true });
await write(join(outDir, 'cartera-valida.xlsx'), HEADERS);
// Missing the last column: rejected with TAX_ROLL_HEADERS_MISMATCH.
await write(join(outDir, 'cartera-invalida.xlsx'), HEADERS.slice(0, -1));
