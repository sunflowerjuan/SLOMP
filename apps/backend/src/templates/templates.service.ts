import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PdfDocumentType, Prisma, Template } from '@prisma/client';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { PdfServiceClient } from '../pdf-jobs/pdf-service.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { extractTemplateFields } from './extract-template-fields.js';
import {
  CATALOGS,
  validateTemplateFields,
} from './validate-template-fields.js';

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

// Serializes the template writes of one municipality: two uploads cannot pick
// the same version, and an activation cannot interleave with an upload.
async function lockMunicipality(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT "id" FROM "municipalities" WHERE "id" = ${id} FOR UPDATE`;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfServiceClient,
  ) {}

  // Validates the .docx, stores it as the next version and makes it the active
  // one; the previous versions stay. A template that fails validation leaves
  // nothing behind: no row, no blob, and the active template is unchanged.
  async upload(
    municipality: MunicipalityContext,
    documentType: PdfDocumentType,
    file: { buffer: Buffer; originalname: string },
    uploadedById: number,
  ): Promise<TemplateView> {
    const catalog = CATALOGS[documentType];
    if (!catalog) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.TEMPLATE_TYPE_UNSUPPORTED,
          `Templates of type ${documentType} cannot be uploaded yet.`,
        ),
      );
    }

    let fields: string[];
    try {
      fields = extractTemplateFields(file.buffer, Object.keys(catalog.loops));
    } catch (error) {
      if (error instanceof CodedError) {
        throw new BadRequestException(
          errorBody(error.code, error.message, error.details),
        );
      }
      throw error;
    }

    const { missing, unknown } = validateTemplateFields(documentType, fields);
    if (missing.length > 0 || unknown.length > 0) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.TEMPLATE_FIELDS_INVALID,
          'The template does not match the fields the system can fill.',
          { missing, unknown },
        ),
      );
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const active = await this.prisma.template.findFirst({
      where: { municipalityId: municipality.id, documentType, isActive: true },
    });
    // The same file again is not a new version.
    if (active?.sha256 === sha256) return toView(active);

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
            throw new ServiceUnavailableException(
              errorBody(
                ErrorCode.PDF_STORAGE_UNAVAILABLE,
                'Could not store the template in Storage.',
              ),
              { cause: error },
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
}
