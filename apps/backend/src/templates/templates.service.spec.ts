import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import {
  buildDocx,
  LIQUIDATION_PARAGRAPHS,
  PAYMENT_ORDER_PARAGRAPHS,
} from './test-docx.js';
import { TemplatesService } from './templates.service.js';

const PAEZ: MunicipalityContext = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};
const ADMIN_ID = 7;

interface Row {
  id: number;
  municipalityId: number;
  documentType: 'LIQUIDACION' | 'MANDAMIENTO';
  version: number;
  blobPath: string;
  sha256: string;
  fileName: string;
  fields: string[];
  isActive: boolean;
  createdAt: Date;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 10,
    municipalityId: PAEZ.id,
    documentType: 'LIQUIDACION',
    version: 1,
    blobPath: 'templates/paez/liquidacion/1.docx',
    sha256: 'a'.repeat(64),
    fileName: 'old.docx',
    fields: [],
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

// Prisma stand-in over an in-memory list: only the calls TemplatesService
// makes, honouring the municipality filter the way the database would.
function build(existing: Row[] = [], options: { failCreate?: boolean } = {}) {
  const rows = [...existing];
  const matches = (where: Record<string, unknown>, r: Row) =>
    Object.entries(where).every(
      ([key, value]) =>
        (r as unknown as Record<string, unknown>)[key] === value,
    );
  const template = {
    findFirst: vi.fn(
      async (args: {
        where: Record<string, unknown>;
        orderBy?: { version: 'desc' };
      }) => {
        const found = rows.filter((r) => matches(args.where, r));
        if (args.orderBy) found.sort((a, b) => b.version - a.version);
        return found[0] ?? null;
      },
    ),
    findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
      rows
        .filter((r) => matches(args.where, r))
        .sort((a, b) => b.version - a.version),
    ),
    updateMany: vi.fn(
      async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = rows.filter((r) => matches(args.where, r));
        hit.forEach((r) => Object.assign(r, args.data));
        return { count: hit.length };
      },
    ),
    update: vi.fn(
      async (args: { where: { id: number }; data: Partial<Row> }) => {
        const found = rows.find((r) => r.id === args.where.id)!;
        return Object.assign(found, args.data);
      },
    ),
    create: vi.fn(async (args: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      if (options.failCreate) throw new Error('database down');
      const created = {
        id: 100 + rows.length,
        createdAt: new Date('2026-10-14T00:00:00Z'),
        ...args.data,
      } as Row;
      rows.push(created);
      return created;
    }),
  };
  const prisma = {
    template,
    $queryRaw: vi.fn().mockResolvedValue([{ id: PAEZ.id }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ template, $queryRaw: prisma.$queryRaw }),
    ),
  };
  const storage = {
    upload: vi.fn().mockResolvedValue(undefined),
    deletePrefix: vi.fn().mockResolvedValue(undefined),
  };
  const pdf = {
    storage: () => storage,
    config: { templatesContainer: 'templates' },
  };
  const service = new TemplatesService(prisma as never, pdf as never);
  return { service, prisma, storage, rows, template };
}

const VALID_DOCX = buildDocx(LIQUIDATION_PARAGRAPHS);
const file = (buffer: Buffer, originalname = 'liquidacion.docx') => ({
  buffer,
  originalname,
});

async function errorOf(promise: Promise<unknown>) {
  const error = (await promise.catch((e) => e)) as {
    getStatus?: () => number;
    getResponse?: () => { code?: string; details?: unknown };
  };
  return {
    status: error.getStatus?.(),
    code: error.getResponse?.().code,
    details: error.getResponse?.().details,
  };
}

describe('TemplatesService.upload', () => {
  it('stores the first valid template as version 1 and activates it', async () => {
    const { service, storage, template } = build();

    const view = await service.upload(
      PAEZ,
      'LIQUIDACION',
      file(VALID_DOCX),
      ADMIN_ID,
    );

    expect(storage.upload).toHaveBeenCalledWith(
      'templates/paez/liquidacion/1.docx',
      VALID_DOCX,
      expect.stringContaining('wordprocessingml.document'),
    );
    expect(template.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        municipalityId: PAEZ.id,
        documentType: 'LIQUIDACION',
        version: 1,
        blobPath: 'templates/paez/liquidacion/1.docx',
        sha256: createHash('sha256').update(VALID_DOCX).digest('hex'),
        fileName: 'liquidacion.docx',
        isActive: true,
        uploadedById: ADMIN_ID,
      }),
    });
    expect(view).toMatchObject({ version: 1, isActive: true });
    expect(view).not.toHaveProperty('blobPath');
  });

  it('gives the next version and deactivates the previous active one, keeping it', async () => {
    const { service, rows } = build([row({ version: 2, isActive: true })]);

    const view = await service.upload(
      PAEZ,
      'LIQUIDACION',
      file(VALID_DOCX),
      ADMIN_ID,
    );

    expect(view.version).toBe(3);
    expect(rows.find((r) => r.version === 2)?.isActive).toBe(false);
    expect(rows.filter((r) => r.isActive).map((r) => r.version)).toEqual([3]);
  });

  it('numbers versions per municipality and type, ignoring other municipalities', async () => {
    const { service } = build([
      row({ municipalityId: 2, version: 9 }),
      row({ documentType: 'MANDAMIENTO', version: 4, isActive: false }),
    ]);

    const view = await service.upload(
      PAEZ,
      'LIQUIDACION',
      file(VALID_DOCX),
      ADMIN_ID,
    );

    expect(view.version).toBe(1);
  });

  it('answers with the active template and creates nothing when the same file is uploaded again', async () => {
    const sha256 = createHash('sha256').update(VALID_DOCX).digest('hex');
    const { service, storage, template } = build([row({ sha256, version: 4 })]);

    const view = await service.upload(
      PAEZ,
      'LIQUIDACION',
      file(VALID_DOCX),
      ADMIN_ID,
    );

    expect(view.version).toBe(4);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(template.create).not.toHaveBeenCalled();
  });

  it('rejects a template that lacks a required field and says which one, storing nothing', async () => {
    const { service, storage, template } = build();
    const docx = buildDocx(['{cadastralCode} {totalAmount}']);

    const error = await errorOf(
      service.upload(PAEZ, 'LIQUIDACION', file(docx), ADMIN_ID),
    );

    expect(error).toEqual({
      status: 400,
      code: ErrorCode.TEMPLATE_FIELDS_INVALID,
      details: { missing: ['resolutionNumber', 'rows'], unknown: [] },
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(template.create).not.toHaveBeenCalled();
  });

  it('rejects a template with a marker that is not in the catalog', async () => {
    const { service } = build();
    const docx = buildDocx([...LIQUIDATION_PARAGRAPHS, '{resolutionNumbr}']);

    const error = await errorOf(
      service.upload(PAEZ, 'LIQUIDACION', file(docx), ADMIN_ID),
    );

    expect(error.code).toBe(ErrorCode.TEMPLATE_FIELDS_INVALID);
    expect(error.details).toEqual({
      missing: [],
      unknown: ['resolutionNumbr'],
    });
  });

  it('keeps the active template when the new one is invalid', async () => {
    const { service, rows } = build([row()]);

    await service
      .upload(
        PAEZ,
        'LIQUIDACION',
        file(buildDocx(['{cadastralCode}'])),
        ADMIN_ID,
      )
      .catch(() => undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.isActive).toBe(true);
  });

  it('maps malformed markers to a 400 with the problem', async () => {
    const { service } = build();

    const error = await errorOf(
      service.upload(
        PAEZ,
        'LIQUIDACION',
        file(buildDocx(['{#rows}{year}'])),
        ADMIN_ID,
      ),
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe(ErrorCode.TEMPLATE_MARKERS_MALFORMED);
  });

  it('maps a file that is not a docx to a 400', async () => {
    const { service } = build();

    const error = await errorOf(
      service.upload(
        PAEZ,
        'LIQUIDACION',
        file(Buffer.from('plain text')),
        ADMIN_ID,
      ),
    );

    expect(error).toMatchObject({
      status: 400,
      code: ErrorCode.TEMPLATE_NOT_DOCX,
    });
  });

  it('accepts a MANDAMIENTO template that uses the payment order fields', async () => {
    const { service, storage } = build();

    const view = await service.upload(
      PAEZ,
      'MANDAMIENTO',
      file(buildDocx(PAYMENT_ORDER_PARAGRAPHS)),
      ADMIN_ID,
    );

    expect(view).toMatchObject({ documentType: 'MANDAMIENTO', isActive: true });
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('refuses a MANDAMIENTO template that carries the liquidation fields', async () => {
    const { service, storage } = build();

    const error = await errorOf(
      service.upload(PAEZ, 'MANDAMIENTO', file(VALID_DOCX), ADMIN_ID),
    );

    expect(error).toMatchObject({ status: 400 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('removes the uploaded blob when saving the row fails', async () => {
    const { service, storage } = build([], { failCreate: true });

    await expect(
      service.upload(PAEZ, 'LIQUIDACION', file(VALID_DOCX), ADMIN_ID),
    ).rejects.toThrow('database down');

    expect(storage.deletePrefix).toHaveBeenCalledWith(
      'templates/paez/liquidacion/1.docx',
    );
  });

  it('answers 503 and stores no row when Storage is down', async () => {
    const { service, storage, template } = build();
    storage.upload.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await errorOf(
      service.upload(PAEZ, 'LIQUIDACION', file(VALID_DOCX), ADMIN_ID),
    );

    expect(error).toMatchObject({
      status: 503,
      code: ErrorCode.PDF_STORAGE_UNAVAILABLE,
    });
    expect(template.create).not.toHaveBeenCalled();
  });

  it('locks the municipality so two uploads never pick the same version', async () => {
    const { service, prisma } = build();

    await service.upload(PAEZ, 'LIQUIDACION', file(VALID_DOCX), ADMIN_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('TemplatesService.list', () => {
  it("lists only the municipality's versions, newest first", async () => {
    const { service, template } = build([
      row({ id: 1, version: 1, isActive: false }),
      row({ id: 2, version: 2 }),
      row({ id: 3, municipalityId: 2, version: 7 }),
    ]);

    const views = await service.list(PAEZ.id, 'LIQUIDACION');

    expect(views.map((v) => v.version)).toEqual([2, 1]);
    expect(template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { municipalityId: PAEZ.id, documentType: 'LIQUIDACION' },
      }),
    );
  });

  it('lists every type when none is asked for', async () => {
    const { service, template } = build();

    await service.list(PAEZ.id);

    expect(template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { municipalityId: PAEZ.id } }),
    );
  });
});

describe('TemplatesService.activate', () => {
  it('reactivates an older version and deactivates the current one', async () => {
    const { service, rows } = build([
      row({ id: 1, version: 1, isActive: false }),
      row({ id: 2, version: 2, isActive: true }),
    ]);

    const view = await service.activate(PAEZ.id, 1);

    expect(view).toMatchObject({ version: 1, isActive: true });
    expect(rows.find((r) => r.id === 2)?.isActive).toBe(false);
  });

  it('answers not found for a template of another municipality', async () => {
    const { service, rows } = build([row({ id: 5, municipalityId: 2 })]);

    const error = await errorOf(service.activate(PAEZ.id, 5));

    expect(error).toMatchObject({
      status: 404,
      code: ErrorCode.TEMPLATE_NOT_FOUND,
    });
    expect(rows[0]!.isActive).toBe(true);
  });
});
