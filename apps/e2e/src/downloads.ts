import { readFileSync, statSync } from "node:fs";

// A PDF a test downloaded is a real one: it starts with the PDF signature and
// is not an empty shell (a blank page is already a few KB).
export function expectPdf(path: string): void {
  const size = statSync(path).size;
  if (size < 1024) {
    throw new Error(`El PDF es demasiado pequeño (${size} bytes): ${path}`);
  }
  const head = readFileSync(path).subarray(0, 5).toString("latin1");
  if (head !== "%PDF-") {
    throw new Error(`El archivo descargado no es un PDF: ${path}`);
  }
}

// The names of the entries of a ZIP, read from its central directory (at the
// end of the file) so no dependency is needed just to list them.
export function zipEntryNames(path: string): string[] {
  const zip = readFileSync(path);
  const END_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== END_SIGNATURE) end -= 1;
  if (end < 0) throw new Error(`No es un ZIP válido: ${path}`);

  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`Directorio central dañado: ${path}`);
    }
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(
      zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
    );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
