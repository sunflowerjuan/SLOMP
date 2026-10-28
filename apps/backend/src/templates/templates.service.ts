import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { buffer as readAll } from 'node:stream/consumers';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  PdfDocumentType,
  Prisma,
  Template,
  TemplateDraft,
} from '@prisma/client';
import type { TemplateRef } from 'shared/pdf-contract';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { PdfServiceClient } from '../pdf-jobs/pdf-service.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { extractTemplateFields } from './extract-template-fields.js';
import {
  applySelections,
  readDocxContent,
  type DocxBlock,
  type DocxContent,
  type Selection,
} from './guided-marking.js';
import { buildTemplateCatalog } from './template-catalog.js';
import { PREVIEW_DATA } from './template-preview-data.js';
import {
  CATALOGS,
  validateTemplateFields,
} from './validate-template-fields.js';

export const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// What the panel sees of a version. The Blob path only travels to the PDF
// service (PdfServiceClient.liquidationTemplate).
export interface TemplateView {
  id: number;
  documentType: PdfDocumentType;
  version: number;
  fileName: string;
  sha256: string;
  fields: string[];
  isActive: boolean;
  createdAt: Date;
}

function toView(template: Template): TemplateView {
  return {
    id: template.id,
    documentType: template.documentType,
    version: template.version,
    fileName: template.fileName,
    sha256: template.sha256,
    fields: template.fields,
    isActive: template.isActive,
    createdAt: template.createdAt,
  };
}

export interface DraftView {
  draftId: string;
  documentType: PdfDocumentType;
  fileName: string;
  createdAt: Date;
  expiresAt: Date;
}

export type DraftContent = DocxContent & {
  draftId: string;
  documentType: PdfDocumentType;
  expiresAt: Date;
};

export interface TemplateContent {
  id: number;
  version: number;
  documentType: PdfDocumentType;
  blocks: DocxBlock[];
  appliedMarkers: (Selection & { label: string })[];
}

// Domain errors of the guided marking (bad selection, malformed marker...) are
// all the client's fault.
function asBadRequest<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof CodedError) {
      throw new BadRequestException(
        errorBody(error.code, error.message, error.details),
        { cause: error },
      );
    }
    throw error;
  }
}

function storageUnavailable(message: string, cause: unknown) {
  return new ServiceUnavailableException(
    errorBody(ErrorCode.PDF_STORAGE_UNAVAILABLE, message),
    { cause },
  );
}

// Serializes the template writes of one municipality: two uploads cannot pick
// the same version, and an activation cannot interleave with an upload.
async function lockMunicipality(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT "id" FROM "municipalities" WHERE "id" = ${id} FOR UPDATE`;
}

@Injectable()
export class TemplatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemplatesService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfServiceClient,
  ) {}

  // ponytail: hourly sweep of expired drafts, so a blob can outlive its 24 h
  // by up to an hour; the API already answers TEMPLATE_DRAFT_EXPIRED then.
  onModuleInit(): void {
    if (!this.pdf.storageConfigured) return;
    this.timer = setInterval(
      () => void this.sweepDrafts(),
      DRAFT_SWEEP_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  // Validates the .docx, stores it as the next version and makes it the active
  // one; the previous versions stay. A template that fails validation leaves
  // nothing behind: no row, no blob, and the active template is unchanged.
  async upload(
    municipality: MunicipalityContext,
    documentType: PdfDocumentType,
    file: { buffer: Buffer; originalname: string },
    uploadedById: number,
  ): Promise<TemplateView> {
    const fields = this.checkedFields(documentType, file.buffer, true);
    return this.storeVersion(municipality, documentType, file, uploadedById, {
      fields,
      replaceConfirmed: true,
    });
  }

  // The markers of the file, checked against the catalog. A draft may still
  // lack required fields (they are demanded on save), never have unknown ones.
  private checkedFields(
    documentType: PdfDocumentType,
    docx: Buffer,
    requireAll: boolean,
  ): string[] {
    const catalog = CATALOGS[documentType];
    if (!catalog) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.TEMPLATE_TYPE_UNSUPPORTED,
          `Templates of type ${documentType} cannot be uploaded yet.`,
        ),
      );
    }
    const fields = asBadRequest(() =>
      extractTemplateFields(docx, Object.keys(catalog.loops)),
    );
    const { missing, unknown } = validateTemplateFields(documentType, fields);
    if (unknown.length > 0 || (requireAll && missing.length > 0)) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.TEMPLATE_FIELDS_INVALID,
          'The template does not match the fields the system can fill.',
          { missing: requireAll ? missing : [], unknown },
        ),
      );
    }
    return fields;
  }

  private async storeVersion(
    municipality: MunicipalityContext,
    documentType: PdfDocumentType,
    file: { buffer: Buffer; originalname: string },
    uploadedById: number,
    {
      fields,
      replaceConfirmed,
    }: { fields: string[]; replaceConfirmed: boolean },
  ): Promise<TemplateView> {
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const active = await this.prisma.template.findFirst({
      where: { municipalityId: municipality.id, documentType, isActive: true },
    });
    // The same file again is not a new version.
    if (active?.sha256 === sha256) return toView(active);
    if (active && !replaceConfirmed) {
      throw new ConflictException(
        errorBody(
          ErrorCode.TEMPLATE_REPLACE_NOT_CONFIRMED,
          `There is already an active ${documentType} template; confirm to replace it.`,
          { activeVersion: active.version, activeFileName: active.fileName },
        ),
      );
    }

    const storage = this.pdf.storage();
    let uploadedPath: string | undefined;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockMunicipality(tx, municipality.id);
          const last = await tx.template.findFirst({
            where: { municipalityId: municipality.id, documentType },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          const version = (last?.version ?? 0) + 1;
          const blobPath = `${this.pdf.config.templatesContainer}/${municipality.slug}/${documentType.toLowerCase()}/${version}.docx`;

          try {
            await storage.upload(blobPath, file.buffer, DOCX_TYPE);
          } catch (error) {
            throw storageUnavailable(
              'Could not store the template in Storage.',
              error,
            );
          }
          uploadedPath = blobPath;

          await tx.template.updateMany({
            where: {
              municipalityId: municipality.id,
              documentType,
              isActive: true,
            },
            data: { isActive: false },
          });
          const created = await tx.template.create({
            data: {
              municipalityId: municipality.id,
              documentType,
              version,
              blobPath,
              sha256,
              fileName: file.originalname,
              fields,
              isActive: true,
              uploadedById,
            },
          });
          return toView(created);
        },
        // Includes the Storage upload, which is a few hundred KB.
        { timeout: 15_000 },
      );
    } catch (error) {
      if (uploadedPath) {
        await storage.deletePrefix(uploadedPath).catch(() => undefined);
      }
      throw error;
    }
  }

  async list(
    municipalityId: number,
    documentType?: PdfDocumentType,
  ): Promise<TemplateView[]> {
    const templates = await this.prisma.template.findMany({
      where: { municipalityId, ...(documentType && { documentType }) },
      orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
    });
    return templates.map(toView);
  }

  // Rollback: makes an older version the active one again.
  async activate(municipalityId: number, id: number): Promise<TemplateView> {
    return this.prisma.$transaction(async (tx) => {
      await lockMunicipality(tx, municipalityId);
      // A template of another municipality is "not found", same as one that
      // does not exist.
      const target = await tx.template.findFirst({
        where: { id, municipalityId },
      });
      if (!target) {
        throw new NotFoundException(
          errorBody(ErrorCode.TEMPLATE_NOT_FOUND, `Template ${id} not found.`),
        );
      }
      if (target.isActive) return toView(target);

      await tx.template.updateMany({
        where: {
          municipalityId,
          documentType: target.documentType,
          isActive: true,
        },
        data: { isActive: false },
      });
      return toView(
        await tx.template.update({ where: { id }, data: { isActive: true } }),
      );
    });
  }

  // Guided marking, step 1: keeps the original unactivated for 24 hours. It
  // may come with valid markers already written; unknown ones are refused.
  async createDraft(
    municipality: MunicipalityContext,
    documentType: PdfDocumentType,
    file: { buffer: Buffer; originalname: string },
    createdById: number,
  ): Promise<DraftView> {
    this.checkedFields(documentType, file.buffer, false);
    asBadRequest(() => readDocxContent(file.buffer, documentType));

    const id = randomUUID();
    const blobPrefix = `${this.pdf.config.templatesContainer}/${municipality.slug}/drafts/${id}/`;
    const storage = this.pdf.storage();
    try {
      await storage.upload(
        `${blobPrefix}original.docx`,
        file.buffer,
        DOCX_TYPE,
      );
    } catch (error) {
      throw storageUnavailable('Could not store the draft in Storage.', error);
    }
    const now = new Date();
    let draft: TemplateDraft;
    try {
      draft = await this.prisma.templateDraft.create({
        data: {
          id,
          documentType,
          fileName: file.originalname,
          blobPrefix,
          createdAt: now,
          expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
          municipalityId: municipality.id,
          createdById,
        },
      });
    } catch (error) {
      await storage.deletePrefix(blobPrefix).catch(() => undefined);
      throw error;
    }
    return {
      draftId: draft.id,
      documentType: draft.documentType,
      fileName: draft.fileName,
      createdAt: draft.createdAt,
      expiresAt: draft.expiresAt,
    };
  }

  async draftContent(
    municipalityId: number,
    userId: number,
    draftId: string,
  ): Promise<DraftContent> {
    const { draft, original } = await this.openDraft(
      municipalityId,
      userId,
      draftId,
    );
    return {
      draftId: draft.id,
      documentType: draft.documentType,
      expiresAt: draft.expiresAt,
      ...asBadRequest(() => readDocxContent(original, draft.documentType)),
    };
  }

  // Marks a copy with the selections and has the PDF service fill it with the
  // sample data. Nothing is saved; required fields are not demanded.
  async previewDraft(
    municipalityId: number,
    userId: number,
    draftId: string,
    selections: Selection[],
    removedRows: string[] = [],
  ): Promise<Buffer> {
    const { draft, original } = await this.openDraft(
      municipalityId,
      userId,
      draftId,
    );
    const marked = asBadRequest(() =>
      applySelections(original, draft.documentType, selections, removedRows),
    );
    const sha256 = createHash('sha256').update(marked).digest('hex');
    // The PDF service reads templates from Storage by path and hash.
    const blob = `${draft.blobPrefix}preview-${sha256}.docx`;
    try {
      await this.pdf.storage().upload(blob, marked, DOCX_TYPE);
    } catch (error) {
      throw storageUnavailable(
        'Could not store the preview in Storage.',
        error,
      );
    }
    return this.renderPreview(draft.documentType, { blob, sha256 });
  }

  private async renderPreview(
    documentType: PdfDocumentType,
    template: TemplateRef,
  ): Promise<Buffer> {
    try {
      return await this.pdf.render({
        schemaVersion: 1,
        documentType,
        template,
        data: PREVIEW_DATA[documentType],
      });
    } catch (error) {
      const code =
        error instanceof HttpException
          ? (error.getResponse() as { code?: string }).code
          : undefined;
      if (code === ErrorCode.PDF_SERVICE_NOT_CONFIGURED) throw error;
      throw new BadGatewayException(
        errorBody(
          ErrorCode.TEMPLATE_PREVIEW_FAILED,
          'Could not fill the template or convert it to PDF.',
        ),
        { cause: error },
      );
    }
  }

  // Any saved version, active or not, shown the way a draft is: its {markers}
  // are already in the text, and appliedMarkers names each one for the lawyer.
  async templateContent(
    municipalityId: number,
    id: number,
  ): Promise<TemplateContent> {
    const template = await this.findTemplate(municipalityId, id);
    const docx = await readAll(await this.openTemplate(template));
    const { blocks, appliedMarkers } = readDocxContent(
      docx,
      template.documentType,
    );
    const labels = new Map(
      buildTemplateCatalog(template.documentType).map((entry) => [
        entry.key,
        entry.label,
      ]),
    );
    return {
      id: template.id,
      version: template.version,
      documentType: template.documentType,
      blocks,
      appliedMarkers: appliedMarkers.map((marker) => ({
        ...marker,
        label: labels.get(marker.field) ?? marker.field,
      })),
    };
  }

  // The stored version is already in Storage with its hash, so the PDF
  // service renders it directly; nothing is copied.
  async templatePreview(municipalityId: number, id: number): Promise<Buffer> {
    const template = await this.findTemplate(municipalityId, id);
    return this.renderPreview(template.documentType, {
      blob: template.blobPath,
      sha256: template.sha256,
    });
  }

  // The bytes exactly as stored, so their sha256 is the one of the version.
  async templateFile(
    municipalityId: number,
    id: number,
  ): Promise<{ fileName: string; stream: Readable }> {
    const template = await this.findTemplate(municipalityId, id);
    return {
      fileName: template.fileName,
      stream: await this.openTemplate(template),
    };
  }

  // A template of another municipality is "not found", same as one that does
  // not exist.
  private async findTemplate(
    municipalityId: number,
    id: number,
  ): Promise<Template> {
    const template = await this.prisma.template.findFirst({
      where: { id, municipalityId },
    });
    if (!template) {
      throw new NotFoundException(
        errorBody(ErrorCode.TEMPLATE_NOT_FOUND, `Template ${id} not found.`),
      );
    }
    return template;
  }

  private async openTemplate(template: Template): Promise<Readable> {
    let stream: Readable | null;
    try {
      stream = await this.pdf.storage().openRead(template.blobPath);
    } catch (error) {
      throw storageUnavailable(
        'Could not read the template from Storage.',
        error,
      );
    }
    if (!stream) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.TEMPLATE_NOT_FOUND,
          `The file of template ${template.id} is gone.`,
        ),
      );
    }
    return stream;
  }

  // Marks the original, validates it like a direct upload and stores it as
  // the new active version; the draft is gone afterwards.
  async saveDraft(
    municipality: MunicipalityContext,
    userId: number,
    draftId: string,
    selections: Selection[],
    replaceConfirmed: boolean,
    removedRows: string[] = [],
  ): Promise<TemplateView> {
    const { draft, original } = await this.openDraft(
      municipality.id,
      userId,
      draftId,
    );
    const marked = asBadRequest(() =>
      applySelections(original, draft.documentType, selections, removedRows),
    );
    const fields = this.checkedFields(draft.documentType, marked, true);
    const view = await this.storeVersion(
      municipality,
      draft.documentType,
      { buffer: marked, originalname: draft.fileName },
      userId,
      { fields, replaceConfirmed },
    );
    // The version is already saved: a leftover draft is the sweep's job, and
    // saving it again only finds the same sha256 active.
    await this.removeDraft(draft).catch((error: Error) =>
      this.logger.warn(`draft ${draft.id} not removed: ${error.message}`),
    );
    return view;
  }

  // Cancelling also works on an expired draft: it only frees its storage.
  async cancelDraft(
    municipalityId: number,
    userId: number,
    draftId: string,
  ): Promise<void> {
    await this.removeDraft(
      await this.findDraft(municipalityId, userId, draftId),
    );
  }

  async sweepDrafts(now: Date = new Date()): Promise<number> {
    try {
      const expired = await this.prisma.templateDraft.findMany({
        where: { expiresAt: { lte: now } },
      });
      const results = await Promise.allSettled(
        expired.map((draft) => this.removeDraft(draft)),
      );
      return results.filter((result) => result.status === 'fulfilled').length;
    } catch (error) {
      // Retried on the next tick; never crash the backend.
      this.logger.error(`draft sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }

  // A draft of another municipality or another administrator is "not found",
  // same as one that does not exist.
  private async findDraft(
    municipalityId: number,
    userId: number,
    draftId: string,
  ): Promise<TemplateDraft> {
    const draft = await this.prisma.templateDraft.findFirst({
      where: { id: draftId, municipalityId, createdById: userId },
    });
    if (!draft) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.TEMPLATE_DRAFT_NOT_FOUND,
          `Draft ${draftId} not found.`,
        ),
      );
    }
    return draft;
  }

  private async openDraft(
    municipalityId: number,
    userId: number,
    draftId: string,
  ): Promise<{ draft: TemplateDraft; original: Buffer }> {
    const draft = await this.findDraft(municipalityId, userId, draftId);
    if (draft.expiresAt <= new Date()) {
      throw new GoneException(
        errorBody(
          ErrorCode.TEMPLATE_DRAFT_EXPIRED,
          `Draft ${draftId} expired at ${draft.expiresAt.toISOString()}.`,
        ),
      );
    }
    let original: Buffer | undefined;
    try {
      const stream = await this.pdf
        .storage()
        .openRead(`${draft.blobPrefix}original.docx`);
      original = stream ? await readAll(stream) : undefined;
    } catch (error) {
      throw storageUnavailable('Could not read the draft from Storage.', error);
    }
    if (!original) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.TEMPLATE_DRAFT_NOT_FOUND,
          `The file of draft ${draftId} is gone.`,
        ),
      );
    }
    return { draft, original };
  }

  // Blob first: a row without its blob answers "not found", a blob without a
  // row would never be cleaned.
  private async removeDraft(draft: TemplateDraft): Promise<void> {
    await this.pdf.storage().deletePrefix(draft.blobPrefix);
    await this.prisma.templateDraft.deleteMany({ where: { id: draft.id } });
  }
}
