import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { ACTIVE_JOB_STATUSES } from '../pdf-jobs/pdf-job-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCadastralCodesBelongToMunicipality } from './assert-municipality.js';
import { parseTaxRollUpload } from './parse-tax-roll-upload.js';
import { persistTaxRoll } from './persist-tax-roll.js';
import type { ParseTaxRollExcelResult } from './tax-roll-row.dto.js';
import type { PersistTaxRollResult } from './persist-tax-roll.js';

// The full Páez roll (11 202 rows) persists in ~2 s; the margin covers a
// slower server and waiting for another load of the same municipality.
const IMPORT_TIMEOUT_MS = 120_000;

@Injectable()
export class TaxRollService {
  constructor(private readonly prisma: PrismaService) {}

  async import(
    municipality: MunicipalityContext,
    buffer: Buffer,
    confirmReplace: boolean,
    fileName: string,
    administratorId: number,
    // Id of a previous TaxRollImport: when the Administrator confirms the
    // replacement of a file that reported conflicts, this call continues
    // that attempt instead of being a new upload.
    previousImportId?: number,
  ) {
    const parsed = await parseTaxRollUpload(buffer);
    await assertCadastralCodesBelongToMunicipality(
      this.prisma,
      municipality,
      parsed.validRows.map((row) => row.cadastralCode),
    );
    const { persisted, importId } = await this.persist(
      municipality.id,
      parsed,
      confirmReplace,
      fileName,
      administratorId,
      previousImportId,
    );
    // Counts only: echoing every valid row back (11 202 for Páez) doubled
    // the memory of the request and the panel never used them (SL-190).
    return {
      validRows: parsed.validRows.length,
      invalidRows: parsed.invalidRows,
      warnings: parsed.warnings,
      persisted,
      importId,
    };
  }

  // A history at /tax-roll/imports, newest first. No pagination for now:
  // the limit is enough for what the panel needs to show.
  async listImports(municipalityId: number) {
    const imports = await this.prisma.taxRollImport.findMany({
      where: { municipalityId },
      orderBy: { importedAt: 'desc' },
      take: 50,
      include: { administrator: { select: { email: true } } },
    });

    return imports.map((entry) => ({
      id: entry.id,
      fileName: entry.fileName,
      importedAt: entry.importedAt,
      validRows: entry.validRows,
      invalidRows: entry.invalidRows,
      warnings: entry.warnings,
      properties: entry.properties,
      owners: entry.owners,
      settlements: entry.settlements,
      conflicts: entry.conflicts,
      administratorEmail: entry.administrator?.email ?? null,
    }));
  }

  private async recordImport(
    tx: Prisma.TransactionClient,
    municipalityId: number,
    fileName: string,
    administratorId: number,
    parsed: ParseTaxRollExcelResult,
    persisted: PersistTaxRollResult,
    previousImportId?: number,
  ): Promise<number> {
    const data = {
      municipalityId,
      fileName,
      administratorId,
      validRows: parsed.validRows.length,
      invalidRows: parsed.invalidRows.length,
      warnings: parsed.warnings.length,
      properties: persisted.properties,
      owners: persisted.owners,
      settlements: persisted.settlements,
      conflicts: persisted.conflicts.length,
    };

    if (previousImportId !== undefined) {
      // The where includes fileName/administratorId besides the id as a
      // minimal safeguard: if the id doesn't match that file and that
      // admin, nothing gets updated and it falls through to the create
      // below.
      const updated = await tx.taxRollImport.updateMany({
        where: {
          id: previousImportId,
          municipalityId,
          fileName,
          administratorId,
        },
        data,
      });
      if (updated.count > 0) {
        return previousImportId;
      }
    }

    const created = await tx.taxRollImport.create({ data });
    return created.id;
  }

  // A bulk job carries its liquidations already assembled in Storage; a load
  // that replaced them meanwhile would leave the job out of date (Confluence
  // SL-118, section 10).
  // ponytail: checked under the import lock, which job creation does not take;
  // a job created in the same instant is caught by its own settlement guard.
  private async assertNoBulkJob(
    tx: Prisma.TransactionClient,
    municipalityId: number,
  ): Promise<void> {
    const active = await tx.pdfJob.count({
      where: { municipalityId, status: { in: ACTIVE_JOB_STATUSES } },
    });
    if (active > 0) {
      throw new ConflictException(
        errorBody(
          ErrorCode.BULK_GENERATION_IN_PROGRESS,
          'A bulk generation job is running for this municipality. Load the tax roll when it finishes.',
        ),
      );
    }
  }

  // The whole load is one transaction: a crash halfway (it already happened
  // with the backend out of memory) leaves the database as it was, and a
  // confirmed replacement never leaves a period without its current
  // settlement. Loads of one municipality run one at a time, so a second
  // upload of the same file sees the first one's settlements as conflicts
  // instead of duplicating them.
  private async persist(
    municipalityId: number,
    parsed: ParseTaxRollExcelResult,
    confirmReplace: boolean,
    fileName: string,
    administratorId: number,
    previousImportId?: number,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tax-roll-import'), ${municipalityId}::int)`;
          await this.assertNoBulkJob(tx, municipalityId);
          const persisted = await persistTaxRoll(
            tx,
            municipalityId,
            parsed.validRows,
            confirmReplace,
          );
          const importId = await this.recordImport(
            tx,
            municipalityId,
            fileName,
            administratorId,
            parsed,
            persisted,
            previousImportId,
          );
          return { persisted, importId };
        },
        { timeout: IMPORT_TIMEOUT_MS },
      );
    } catch (error) {
      if (
        error instanceof CodedError &&
        error.code === ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY
      ) {
        throw new BadRequestException(
          errorBody(error.code, error.message, error.details),
        );
      }
      throw error;
    }
  }
}
