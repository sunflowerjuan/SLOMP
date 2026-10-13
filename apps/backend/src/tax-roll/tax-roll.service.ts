import { BadRequestException, Injectable } from '@nestjs/common';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCadastralCodesBelongToMunicipality } from './assert-municipality.js';
import { parseTaxRollUpload } from './parse-tax-roll-upload.js';
import { persistTaxRoll } from './persist-tax-roll.js';
import type { ParseTaxRollExcelResult } from './tax-roll-row.dto.js';
import type { PersistTaxRollResult } from './persist-tax-roll.js';

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
