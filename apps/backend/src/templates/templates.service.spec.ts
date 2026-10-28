import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { readDocxContent, type Selection } from './guided-marking.js';
import { PREVIEW_DATA } from './template-preview-data.js';
import {
  buildDocx,
  docxFromXml,
  LIQUIDATION_PARAGRAPHS,
  paragraphXml,
  PAYMENT_ORDER_PARAGRAPHS,
  tableXml,
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

interface DraftRow {
  id: string;
  municipalityId: number;
  createdById: number;
  documentType: 'LIQUIDACION' | 'MANDAMIENTO';
  fileName: string;
  blobPrefix: string;
  createdAt: Date;
  expiresAt: Date;
}

// Prisma stand-in over an in-memory list: only the calls TemplatesService
// makes, honouring the municipality filter the way the database would.
function build(
  existing: Row[] = [],
  options: { failCreate?: boolean; drafts?: DraftRow[] } = {},
) {
  const rows = [...existing];
  const drafts = [...(options.drafts ?? [])];
  const blobs = new Map<string, Buffer>();
  for (const draft of drafts) {
    blobs.set(`${draft.blobPrefix}original.docx`, UNMARKED_DOCX);
  }
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
  const templateDraft = {
    create: vi.fn(async (args: { data: DraftRow }) => {
      drafts.push(args.data);
      return args.data;
    }),
    findFirst: vi.fn(
      async (args: { where: Record<string, unknown> }) =>
        drafts.find((d) =>
          Object.entries(args.where).every(
            ([key, value]) =>
              (d as unknown as Record<string, unknown>)[key] === value,
          ),
        ) ?? null,
    ),
    findMany: vi.fn(async (args: { where: { expiresAt: { lte: Date } } }) =>
      drafts.filter((d) => d.expiresAt <= args.where.expiresAt.lte),
    ),
    deleteMany: vi.fn(async (args: { where: { id: string } }) => {
      const at = drafts.findIndex((d) => d.id === args.where.id);
      if (at >= 0) drafts.splice(at, 1);
      return { count: at >= 0 ? 1 : 0 };
    }),
  };
  const prisma = {
    template,
    templateDraft,
    $queryRaw: vi.fn().mockResolvedValue([{ id: PAEZ.id }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ template, $queryRaw: prisma.$queryRaw }),
    ),
  };
  const storage = {
    upload: vi.fn(async (path: string, data: Buffer) => {
      blobs.set(path, data);
    }),
    openRead: vi.fn(async (path: string) => {
      const data = blobs.get(path);
      return data ? Readable.from([data]) : null;
    }),
    deletePrefix: vi.fn(async (prefix: string) => {
      for (const path of blobs.keys()) {
        if (path.startsWith(prefix)) blobs.delete(path);
      }
    }),
  };
  const pdf = {
    storage: () => storage,
    config: { templatesContainer: 'templates' },
    render: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
  };
  const service = new TemplatesService(prisma as never, pdf as never);
  return { service, prisma, storage, pdf, rows, drafts, blobs, template };
}

// The liquidation fields with the markers replaced by sample text, as the
// lawyer uploads a document before marking it.
const UNMARKED_DOCX = docxFromXml(
  ['RESOLUCIÓN 045', 'Predio 00-01-0001', 'Total $1.250.000']
    .map((text) => paragraphXml(text))
    .join('') + tableXml([['2024', '$350.000']]),
);
const ALL_REQUIRED: Selection[] = [
  { blockId: 'body:p0', start: 11, end: 14, field: 'resolutionNumber' },
  { blockId: 'body:p1', start: 7, end: 17, field: 'cadastralCode' },
  { blockId: 'body:p2', start: 6, end: 16, field: 'totalAmount' },
  { blockId: 'body:p3', start: 0, end: 4, field: 'rows.year' },
];

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

describe('TemplatesService guided marking drafts', () => {
  const DRAFT_ID = '6f1c2c1e-3b0e-4c3a-9d55-0a7c2e8f4b21';
  const draft = (overrides: Partial<DraftRow> = {}): DraftRow => ({
    id: DRAFT_ID,
    municipalityId: PAEZ.id,
    createdById: ADMIN_ID,
    documentType: 'LIQUIDACION',
    fileName: 'liquidacion-sin-marcar.docx',
    blobPrefix: `templates/paez/drafts/${DRAFT_ID}/`,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });
  const OTHER = { ...PAEZ, id: 2, slug: 'otro' };

  describe('createDraft', () => {
    it('stores the original under the municipality without activating anything', async () => {
      const { service, blobs, drafts, template } = build();

      const view = await service.createDraft(
        PAEZ,
        'LIQUIDACION',
        file(UNMARKED_DOCX, 'sin-marcar.docx'),
        ADMIN_ID,
      );

      expect(
        blobs.get(`templates/paez/drafts/${view.draftId}/original.docx`),
      ).toBe(UNMARKED_DOCX);
      expect(drafts).toHaveLength(1);
      expect(view.expiresAt.getTime() - view.createdAt.getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
      expect(view).toMatchObject({
        documentType: 'LIQUIDACION',
        fileName: 'sin-marcar.docx',
      });
      expect(template.create).not.toHaveBeenCalled();
    });

    it('accepts a document with valid markers but refuses unknown ones', async () => {
      const { service } = build();
      await expect(
        service.createDraft(
          PAEZ,
          'LIQUIDACION',
          file(buildDocx(['Resolución {resolutionNumber}'])),
          ADMIN_ID,
        ),
      ).resolves.toHaveProperty('draftId');

      const error = await errorOf(
        service.createDraft(
          PAEZ,
          'LIQUIDACION',
          file(buildDocx(['{inventado}'])),
          ADMIN_ID,
        ),
      );
      expect(error).toEqual({
        status: 400,
        code: ErrorCode.TEMPLATE_FIELDS_INVALID,
        details: { missing: [], unknown: ['inventado'] },
      });
    });

    it('refuses a file that is not a .docx and stores nothing', async () => {
      const { service, storage } = build();
      const error = await errorOf(
        service.createDraft(
          PAEZ,
          'LIQUIDACION',
          file(Buffer.from('nope')),
          ADMIN_ID,
        ),
      );
      expect(error).toMatchObject({
        status: 400,
        code: ErrorCode.TEMPLATE_NOT_DOCX,
      });
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  it('returns the blocks of the original', async () => {
    const { service } = build([], { drafts: [draft()] });
    const content = await service.draftContent(PAEZ.id, ADMIN_ID, DRAFT_ID);
    expect(content).toMatchObject({
      draftId: DRAFT_ID,
      documentType: 'LIQUIDACION',
      ...readDocxContent(UNMARKED_DOCX, 'LIQUIDACION'),
    });
  });

  it('answers not found for a draft of another municipality or administrator, or one that does not exist', async () => {
    const { service, drafts } = build([], { drafts: [draft()] });
    const calls = [
      service.draftContent(OTHER.id, ADMIN_ID, DRAFT_ID),
      service.draftContent(PAEZ.id, ADMIN_ID + 1, DRAFT_ID),
      service.draftContent(PAEZ.id, ADMIN_ID, 'nope'),
      service.previewDraft(OTHER.id, ADMIN_ID, DRAFT_ID, []),
      service.saveDraft(OTHER, ADMIN_ID, DRAFT_ID, ALL_REQUIRED, true),
      service.cancelDraft(OTHER.id, ADMIN_ID, DRAFT_ID),
    ];
    for (const call of calls) {
      expect(await errorOf(call)).toMatchObject({
        status: 404,
        code: ErrorCode.TEMPLATE_DRAFT_NOT_FOUND,
      });
    }
    expect(drafts).toHaveLength(1);
  });

  it('answers gone for an expired draft', async () => {
    const { service } = build([], {
      drafts: [draft({ expiresAt: new Date(Date.now() - 1) })],
    });
    for (const call of [
      service.draftContent(PAEZ.id, ADMIN_ID, DRAFT_ID),
      service.previewDraft(PAEZ.id, ADMIN_ID, DRAFT_ID, []),
      service.saveDraft(PAEZ, ADMIN_ID, DRAFT_ID, ALL_REQUIRED, true),
    ]) {
      expect(await errorOf(call)).toMatchObject({
        status: 410,
        code: ErrorCode.TEMPLATE_DRAFT_EXPIRED,
      });
    }
  });

  describe('previewDraft', () => {
    it('renders the marked copy with the sample data and saves no version', async () => {
      const { service, pdf, blobs, template } = build([], {
        drafts: [draft()],
      });

      const result = await service.previewDraft(
        PAEZ.id,
        ADMIN_ID,
        DRAFT_ID,
        ALL_REQUIRED.slice(0, 1),
      );

      expect(result.toString()).toBe('%PDF-1.7');
      const request = pdf.render.mock.calls[0]![0];
      expect(request).toMatchObject({
        documentType: 'LIQUIDACION',
        data: PREVIEW_DATA.LIQUIDACION,
      });
      const marked = blobs.get(request.template.blob)!;
      expect(request.template.blob).toMatch(
        new RegExp(
          `^templates/paez/drafts/${DRAFT_ID}/preview-[0-9a-f]{64}\\.docx$`,
        ),
      );
      expect(createHash('sha256').update(marked).digest('hex')).toBe(
        request.template.sha256,
      );
      expect(readDocxContent(marked, 'LIQUIDACION').blocks[0]!.text).toBe(
        'RESOLUCIÓN {resolutionNumber}',
      );
      expect(template.create).not.toHaveBeenCalled();
    });

    it('rejects a bad selection with its code and leaves the original as it was', async () => {
      const { service, blobs, pdf } = build([], { drafts: [draft()] });
      const error = await errorOf(
        service.previewDraft(PAEZ.id, ADMIN_ID, DRAFT_ID, [
          { blockId: 'body:p0', start: 0, end: 5, field: 'cadastralCode' },
          { blockId: 'body:p0', start: 4, end: 8, field: 'propertyName' },
        ]),
      );
      expect(error).toEqual({
        status: 400,
        code: ErrorCode.TEMPLATE_SELECTION_OVERLAP,
        details: { indexes: [0, 1] },
      });
      expect(blobs.get(`${draft().blobPrefix}original.docx`)).toBe(
        UNMARKED_DOCX,
      );
      expect(pdf.render).not.toHaveBeenCalled();
    });

    it('answers 502 when the PDF service cannot fill or convert it', async () => {
      const { service, pdf } = build([], { drafts: [draft()] });
      pdf.render.mockRejectedValue(
        new ServiceUnavailableException({ code: 'TEMPLATE_RENDER_FAILED' }),
      );
      expect(
        await errorOf(service.previewDraft(PAEZ.id, ADMIN_ID, DRAFT_ID, [])),
      ).toMatchObject({ status: 502, code: ErrorCode.TEMPLATE_PREVIEW_FAILED });
    });
  });

  describe('saveDraft', () => {
    it('stores the marked document as the new active version and removes the draft', async () => {
      const { service, drafts, blobs, rows } = build([], {
        drafts: [draft()],
      });

      const view = await service.saveDraft(
        PAEZ,
        ADMIN_ID,
        DRAFT_ID,
        ALL_REQUIRED,
        false,
      );

      expect(view).toMatchObject({
        version: 1,
        isActive: true,
        fileName: 'liquidacion-sin-marcar.docx',
      });
      expect(rows[0]!.fields.toSorted()).toEqual(
        [
          'cadastralCode',
          'resolutionNumber',
          'rows',
          'rows.year',
          'totalAmount',
        ].sort(),
      );
      expect(drafts).toHaveLength(0);
      expect([...blobs.keys()]).toEqual(['templates/paez/liquidacion/1.docx']);
    });

    it('answers 409 without replaceConfirmed when there is an active template, changing nothing', async () => {
      const active = row({ version: 2, fileName: 'liquidacion-paez.docx' });
      const { service, rows, drafts, template } = build([active], {
        drafts: [draft()],
      });

      const error = await errorOf(
        service.saveDraft(PAEZ, ADMIN_ID, DRAFT_ID, ALL_REQUIRED, false),
      );

      expect(error).toEqual({
        status: 409,
        code: ErrorCode.TEMPLATE_REPLACE_NOT_CONFIRMED,
        details: { activeVersion: 2, activeFileName: 'liquidacion-paez.docx' },
      });
      expect(rows).toEqual([active]);
      expect(template.create).not.toHaveBeenCalled();
      expect(drafts).toHaveLength(1);
    });

    it('replaces the active template with replaceConfirmed, keeping the old version', async () => {
      const { service, rows } = build([row({ id: 1, version: 2 })], {
        drafts: [draft()],
      });

      const view = await service.saveDraft(
        PAEZ,
        ADMIN_ID,
        DRAFT_ID,
        ALL_REQUIRED,
        true,
      );

      expect(view).toMatchObject({ version: 3, isActive: true });
      expect(rows.find((r) => r.id === 1)).toMatchObject({
        version: 2,
        isActive: false,
      });
    });

    it('rejects a marking without a required field and creates no version', async () => {
      const { service, template, drafts } = build([], { drafts: [draft()] });

      const error = await errorOf(
        service.saveDraft(
          PAEZ,
          ADMIN_ID,
          DRAFT_ID,
          ALL_REQUIRED.filter((s) => s.field !== 'totalAmount'),
          true,
        ),
      );

      expect(error).toEqual({
        status: 400,
        code: ErrorCode.TEMPLATE_FIELDS_INVALID,
        details: { missing: ['totalAmount'], unknown: [] },
      });
      expect(template.create).not.toHaveBeenCalled();
      expect(drafts).toHaveLength(1);
    });
  });

  it('cancels a draft, also an expired one, removing its files', async () => {
    const { service, drafts, blobs } = build([], {
      drafts: [draft({ expiresAt: new Date(Date.now() - 1) })],
    });
    await service.cancelDraft(PAEZ.id, ADMIN_ID, DRAFT_ID);
    expect(drafts).toHaveLength(0);
    expect(blobs.size).toBe(0);
  });

  it('sweeps only the expired drafts', async () => {
    const now = new Date('2026-10-27T12:00:00Z');
    const expired = draft({
      id: 'old',
      blobPrefix: 'templates/paez/drafts/old/',
      expiresAt: new Date('2026-10-27T11:00:00Z'),
    });
    const live = draft({ expiresAt: new Date('2026-10-28T11:00:00Z') });
    const { service, drafts, blobs } = build([], { drafts: [expired, live] });

    expect(await service.sweepDrafts(now)).toBe(1);
    expect(drafts).toEqual([live]);
    expect([...blobs.keys()]).toEqual([`${live.blobPrefix}original.docx`]);
  });
});
