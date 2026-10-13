import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { ACTIVE_JOB_STATUSES } from '../pdf-jobs/pdf-job-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseTaxRollExcel } from './parse-tax-roll-excel.js';
import { persistTaxRoll } from './persist-tax-roll.js';
import type { ParseTaxRollExcelResult } from './tax-roll-row.dto.js';
import type { PersistTaxRollResult } from './persist-tax-roll.js';
import { checkCadastralDanePrefix } from './validate-dane-prefix.js';

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
    const parsed = await this.parse(buffer);
    await this.assertBelongsToMunicipality(municipality, parsed);
    await this.assertNoBulkJob(municipality.id);
    const persisted = await this.persist(
      municipality.id,
      parsed,
      confirmReplace,
    );
    const importId = await this.recordImport(
      municipality.id,
      fileName,
      administratorId,
      parsed,
      persisted,
      previousImportId,
    );
    return { ...parsed, persisted, importId };
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
      const updated = await this.prisma.taxRollImport.updateMany({
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

    const created = await this.prisma.taxRollImport.create({ data });
    return created.id;
  }

  private async parse(buffer: Buffer) {
    try {
      return await parseTaxRollExcel(buffer);
    } catch (error) {
      if (error instanceof CodedError) {
        throw new BadRequestException(
          errorBody(error.code, error.message, error.details),
        );
      }
      throw new BadRequestException(
        errorBody(
          ErrorCode.TAX_ROLL_UNREADABLE,
          'Could not read the Excel file.',
        ),
        { cause: error },
      );
    }
  }

  // The whole file is rejected, before anything is saved, if any cadastral
  // code does not start with the active municipality's DANE code.
  private async assertBelongsToMunicipality(
    municipality: MunicipalityContext,
    parsed: ParseTaxRollExcelResult,
  ) {
    const check = checkCadastralDanePrefix(
      parsed.validRows.map((row) => row.cadastralCode),
      municipality.daneCode,
    );
    if (check.matches) return;

    const registered = await this.prisma.municipality.findMany({
      where: { daneCode: { in: check.foundPrefixes.map((p) => p.prefix) } },
      select: { daneCode: true, name: true, state: true },
    });
    const nameByDane = new Map(
      registered.map((m) => [m.daneCode, `${m.name}, ${m.state}`]),
    );
    const foundPrefixes = check.foundPrefixes.map((entry) => ({
      ...entry,
      municipality: nameByDane.get(entry.prefix) ?? null,
    }));
    const guess = foundPrefixes.find((entry) => entry.municipality);

    throw new BadRequestException(
      errorBody(
        ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY,
        guess
          ? `This file seems to belong to ${guess.municipality}, not to ${municipality.name}, ${municipality.state}.`
          : `${check.mismatchedRows} cadastral code(s) do not start with the DANE code ${municipality.daneCode} of ${municipality.name}, ${municipality.state}.`,
        {
          expectedPrefix: municipality.daneCode,
          mismatchedRows: check.mismatchedRows,
          foundPrefixes,
        },
      ),
    );
  }

  // A bulk job carries its liquidations already assembled in Storage; a load
  // that replaced them meanwhile would leave the job out of date (Confluence
  // SL-118, section 10).
  // ponytail: checked before persisting, not under a lock; a job created in
  // the same instant is caught by the job's own settlement guard instead.
  private async assertNoBulkJob(municipalityId: number): Promise<void> {
    const active = await this.prisma.pdfJob.count({
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

  private async persist(
    municipalityId: number,
    parsed: ParseTaxRollExcelResult,
    confirmReplace: boolean,
  ) {
    try {
      return await persistTaxRoll(
        this.prisma,
        municipalityId,
        parsed.validRows,
        confirmReplace,
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
