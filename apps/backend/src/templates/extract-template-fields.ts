import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { CodedError } from '../common/errors/coded-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';

// A real template is a few hundred KB; this only stops a zip bomb (a tiny
// upload that expands to gigabytes) before anything is inflated.
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

interface TagTree {
  [name: string]: TagTree;
}
interface TagParts {
  document: { tags: TagTree };
  headers: { tags: TagTree }[];
  footers: { tags: TagTree }[];
}
interface TemplateProblem {
  properties?: { id?: string; xtag?: string };
  message?: string;
}

function notDocx(message: string): CodedError {
  return new CodedError(ErrorCode.TEMPLATE_NOT_DOCX, message);
}

function openDocx(docx: Buffer, maxUncompressedBytes: number): PizZip {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch (error) {
    throw new CodedError(
      ErrorCode.TEMPLATE_NOT_DOCX,
      'The file is not a valid .docx (it is not a zip archive).',
      undefined,
      { cause: error },
    );
  }
  const entries = Object.values(zip.files);
  const uncompressed = entries.reduce(
    (total, entry) =>
      total +
      ((entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0),
    0,
  );
  if (uncompressed > maxUncompressedBytes) {
    throw notDocx('The .docx expands to more than the allowed size.');
  }
  if (!zip.file('word/document.xml')) {
    throw notDocx('The file is a zip but has no Word document inside.');
  }
  if (entries.some((entry) => /(^|\/)vbaProject\.bin$/i.test(entry.name))) {
    throw new CodedError(
      ErrorCode.TEMPLATE_HAS_MACROS,
      'The template contains macros, which are not allowed.',
    );
  }
  return zip;
}

// Loop fields are reported as "loop.field". A conditional section such as
// {#owners}{owners}{/owners} keeps its children in the parent's scope, so
// they are reported at the level they resolve to.
function collect(
  tags: TagTree,
  loops: readonly string[],
  found: Set<string>,
  loop?: string,
): void {
  for (const [name, children] of Object.entries(tags)) {
    found.add(loop ? `${loop}.${name}` : name);
    collect(children, loops, found, loops.includes(name) ? name : loop);
  }
}

// Detects the `{field}` markers of a .docx without rendering it. Docxtemplater
// joins markers that Word split across runs, so `{resolu` + `tionNumber}` is
// found as one marker. `loops` names the `{#loop}` sections whose inner
// fields only exist inside them.
export function extractTemplateFields(
  docx: Buffer,
  loops: readonly string[],
  options: { maxUncompressedBytes?: number } = {},
): string[] {
  const zip = openDocx(
    docx,
    options.maxUncompressedBytes ?? MAX_UNCOMPRESSED_BYTES,
  );

  let parts: TagParts;
  try {
    // getTags() is public API since docxtemplater 3.x but missing from its
    // bundled typings.
    parts = (
      new Docxtemplater(zip, { paragraphLoop: true }) as unknown as {
        getTags(): TagParts;
      }
    ).getTags();
  } catch (error) {
    const problems = (
      (error as { properties?: { errors?: TemplateProblem[] } }).properties
        ?.errors ?? [error as TemplateProblem]
    ).map((problem) => ({
      marker: problem.properties?.xtag,
      problem: problem.properties?.id ?? problem.message,
    }));
    throw new CodedError(
      ErrorCode.TEMPLATE_MARKERS_MALFORMED,
      'The template has markers that are not well formed.',
      { problems },
      { cause: error },
    );
  }

  const found = new Set<string>();
  for (const part of [parts.document, ...parts.headers, ...parts.footers]) {
    collect(part.tags, loops, found);
  }
  return [...found];
}
