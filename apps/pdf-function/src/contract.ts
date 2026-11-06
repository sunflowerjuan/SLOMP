import type {
  BatchInput,
  DocumentType,
  RenderRequest,
  TemplateRef,
  WorkMessage,
} from 'shared/pdf-contract';
import { JobError } from './errors.ts';

// Validators for the messages and requests agreed with the backend; the shapes
// themselves live in packages/shared/pdf-contract.d.ts. Validated by hand: class-validator relies on decorators, which Node's type
// stripping can't run.

export type {
  AssembleZipMessage,
  BatchInput,
  BatchResult,
  DocumentType,
  RenderBatchMessage,
  RenderRequest,
  TemplateRef,
  WorkMessage,
  ZipResult,
} from 'shared/pdf-contract';

type Json = Record<string, unknown>;

class InvalidShape extends Error {}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(obj: Json, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidShape(`"${key}" must be a non-empty string`);
  }
  return value;
}

function int(obj: Json, key: string, min: number): number {
  const value = obj[key];
  if (!Number.isInteger(value) || (value as number) < min) {
    throw new InvalidShape(`"${key}" must be an integer >= ${min}`);
  }
  return value as number;
}

// Blob paths and file names come from the backend, but a "../" or an
// absolute path would still let a message write outside its job folder (or
// escape the ZIP when it is extracted), so they are rejected outright.
function safePath(obj: Json, key: string): string {
  const value = str(obj, key);
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new InvalidShape(
      `"${key}" must be a relative path without "." or ".."`,
    );
  }
  return value;
}

function prefix(obj: Json, key: string): string {
  const value = safePath(obj, key);
  if (!value.endsWith('/'))
    throw new InvalidShape(`"${key}" must end with "/"`);
  return value;
}

function documentType(obj: Json): DocumentType {
  const value = obj.documentType;
  if (value !== 'LIQUIDACION' && value !== 'MANDAMIENTO') {
    throw new InvalidShape('"documentType" must be LIQUIDACION or MANDAMIENTO');
  }
  return value;
}

function template(obj: Json): TemplateRef {
  const value = obj.template;
  if (!isObject(value)) throw new InvalidShape('"template" must be an object');
  const sha256 = str(value, 'sha256');
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new InvalidShape(
      '"template.sha256" must be 64 lowercase hex characters',
    );
  }
  return { blob: safePath(value, 'blob'), sha256 };
}

function data(obj: Json): Json {
  if (!isObject(obj.data)) throw new InvalidShape('"data" must be an object');
  return obj.data;
}

function schemaVersion(obj: Json): 1 {
  if (obj.schemaVersion !== 1)
    throw new InvalidShape('"schemaVersion" must be 1');
  return 1;
}

function guard<T>(label: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof InvalidShape) {
      throw new JobError(
        'INVALID_MESSAGE',
        `Invalid ${label}: ${error.message}`,
      );
    }
    throw error;
  }
}

export function parseWorkMessage(raw: unknown): WorkMessage {
  return guard('queue message', () => {
    if (!isObject(raw)) throw new InvalidShape('not a JSON object');
    schemaVersion(raw);
    if (raw.type === 'render-batch') {
      return {
        schemaVersion: 1,
        type: 'render-batch',
        jobId: str(raw, 'jobId'),
        municipalityId: int(raw, 'municipalityId', 1),
        documentType: documentType(raw),
        batchIndex: int(raw, 'batchIndex', 0),
        inputBlob: safePath(raw, 'inputBlob'),
        template: template(raw),
        outputPrefix: prefix(raw, 'outputPrefix'),
      };
    }
    if (raw.type === 'assemble-zip') {
      return {
        schemaVersion: 1,
        type: 'assemble-zip',
        jobId: str(raw, 'jobId'),
        sourcePrefix: prefix(raw, 'sourcePrefix'),
        zipBlob: safePath(raw, 'zipBlob'),
        expectedFiles: int(raw, 'expectedFiles', 1),
      };
    }
    throw new InvalidShape('"type" must be render-batch or assemble-zip');
  });
}

export function parseBatchInput(raw: unknown): BatchInput {
  return guard('batch input', () => {
    if (
      !isObject(raw) ||
      !Array.isArray(raw.documents) ||
      raw.documents.length === 0
    ) {
      throw new InvalidShape('"documents" must be a non-empty array');
    }
    const names = new Set<string>();
    const documents = raw.documents.map((doc: unknown) => {
      if (!isObject(doc))
        throw new InvalidShape('each document must be an object');
      const fileName = safePath(doc, 'fileName');
      if (!fileName.endsWith('.pdf'))
        throw new InvalidShape('"fileName" must end in .pdf');
      if (names.has(fileName))
        throw new InvalidShape(`duplicate fileName "${fileName}"`);
      names.add(fileName);
      return { fileName, data: data(doc) };
    });
    return { documents };
  });
}

export function parseRenderRequest(raw: unknown): RenderRequest {
  return guard('render request', () => {
    if (!isObject(raw)) throw new InvalidShape('not a JSON object');
    return {
      schemaVersion: schemaVersion(raw),
      documentType: documentType(raw),
      template: template(raw),
      data: data(raw),
    };
  });
}
