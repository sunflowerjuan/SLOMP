import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectPdf, zipEntryNames } from "../src/downloads";

const dir = mkdtempSync(join(tmpdir(), "e2e-downloads-"));

function write(name: string, content: Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

// A ZIP with empty entries, enough for the central directory the reader needs.
function zipOf(names: string[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

test("expectPdf acepta un PDF y rechaza uno vacío o que no lo es", () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2048)]);
  expect(() => expectPdf(write("ok.pdf", pdf))).not.toThrow();
  expect(() => expectPdf(write("vacio.pdf", Buffer.alloc(0)))).toThrow(
    /demasiado pequeño/,
  );
  expect(() => expectPdf(write("texto.pdf", Buffer.alloc(2048, "a")))).toThrow(
    /no es un PDF/,
  );
});

test("zipEntryNames lista las entradas del ZIP y rechaza lo que no es un ZIP", () => {
  const names = ["a/x.pdf", "b/y.pdf"];
  expect(zipEntryNames(write("ok.zip", zipOf(names)))).toEqual(names);
  expect(() => zipEntryNames(write("no.zip", Buffer.alloc(64)))).toThrow(
    /No es un ZIP/,
  );
});
