// Fictional tax roll Excel files and Word templates without markers for the
// Playwright suite (apps/e2e). Names, documents and amounts are invented;
// cadastral codes use the DANE code of the e2e-prueba municipality (99999).
// Output: apps/e2e/fixtures/generated/ (git-ignored).
// Run: pnpm --filter backend run e2e:fixtures
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';

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

async function write(path, headers, extraRows = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cartera');
  sheet.addRow(headers);
  [...rows(), ...extraRows].forEach((row) => sheet.addRow(row));
  await workbook.xlsx.writeFile(path);
  console.log(`Written ${path}`);
}

// The first property again, for a period before 1980: one invalid row
// (PERIOD_OUT_OF_RANGE) among valid ones.
function outOfRangeRow() {
  const row = rows()[0];
  row[6] = 1979;
  return row;
}

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../e2e/fixtures/generated',
);
mkdirSync(outDir, { recursive: true });
await write(join(outDir, 'cartera-valida.xlsx'), HEADERS);
// Missing the last column: rejected with TAX_ROLL_HEADERS_MISMATCH.
await write(join(outDir, 'cartera-invalida.xlsx'), HEADERS.slice(0, -1));
// Valid columns and one row out of range: the payment orders upload stays in
// its first step until it is fixed.
await write(join(outDir, 'cartera-fila-invalida.xlsx'), HEADERS, [
  outOfRangeRow(),
]);

// Word templates as a municipality would bring them: the example values are
// written in, without any {marker}, so guided marking has to add them.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// "**text**" is a bold run and "_text_" an italic one.
function paragraph(...runs) {
  const xml = runs.map((run) => {
    const bold = /^\*\*(.*)\*\*$/s.exec(run);
    const italic = /^_(.*)_$/s.exec(run);
    const text = bold?.[1] ?? italic?.[1] ?? run;
    const props = bold
      ? '<w:rPr><w:b/></w:rPr>'
      : italic
        ? '<w:rPr><w:i/></w:rPr>'
        : '';
    return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  });
  return `<w:p>${xml.join('')}</w:p>`;
}

function table(rows) {
  const borders =
    '<w:tblPr><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(
        (side) =>
          `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`,
      )
      .join('') +
    '</w:tblBorders></w:tblPr>';
  const body = rows
    .map(
      (cells) =>
        `<w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`,
    )
    .join('');
  return `<w:tbl>${borders}${body}</w:tbl>`;
}

function writeDocx(path, bodyXml) {
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
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${bodyXml}</w:body></w:document>`,
  );
  writeFileSync(
    path,
    zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  console.log(`Written ${path}`);
}

writeDocx(
  join(outDir, 'plantilla-liquidacion-sin-marcadores.docx'),
  [
    paragraph('**ALCALDÍA MUNICIPAL DE PRUEBA**'),
    paragraph('Resolución No. ', '**RES-0000-2026**'),
    paragraph('Liquidación oficial del impuesto predial unificado.'),
    paragraph(
      'Predio Lote de Ejemplo, con código catastral 00-00-0000-0000-000.',
    ),
    paragraph('Propietarios: Nombre de Ejemplo.'),
    paragraph('Vigencias cobradas: 2020 a 2021.'),
    table([
      ['**Vigencia**', '**Concepto**', '**Capital**', '**Intereses**'],
      ['2020', 'Impuesto predial', '$100.000', '$20.000'],
    ]),
    paragraph('Total capital: $100.000. Total intereses: $20.000.'),
    paragraph('Valor total a pagar: ', '_$120.000_'),
  ].join(''),
);

writeDocx(
  join(outDir, 'plantilla-mandamiento-sin-marcadores.docx'),
  [
    paragraph('**MANDAMIENTO DE PAGO No. MND-0000-2026**'),
    paragraph('Fecha de expedición: 01/01/2026.'),
    paragraph(
      'Predio Lote de Ejemplo, con código catastral 00-00-0000-0000-000, de propiedad de Nombre de Ejemplo.',
    ),
    paragraph(
      'Se libra mandamiento de pago por $100.000 de capital, de las vigencias 2020 a 2021, según las liquidaciones LIQ-0000-2026.',
    ),
  ].join(''),
);

// A liquidation whose table comes filled with several rows of example values
// and a total, the way a municipality's real document does: guided marking
// keeps one row as the example and removes the rest.
writeDocx(
  join(outDir, 'plantilla-liquidacion-tabla-llena.docx'),
  [
    paragraph('**RESOLUCIÓN No. RES-0000-2026**'),
    paragraph('Predio con código catastral 00-00-0000-0000-000.'),
    table([
      ['**Año**', '**Cobro**', '**Interés**', '**Capital**'],
      ['2022', 'IMPUESTO PREDIAL', '$ 29.028', '$ 25.565'],
      ['2022', 'SOBRETASA AMBIENTAL', '$ 8.708', '$ 7.670'],
      ['2023', 'IMPUESTO PREDIAL', '$ 22.843', '$ 26.330'],
      ['2024', 'IMPUESTO PREDIAL', '$ 30.641', '$ 51.300'],
      ['**TOTAL**', '**$ 371.429**', '', ''],
    ]),
  ].join(''),
);
