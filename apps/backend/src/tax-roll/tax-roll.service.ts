import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseTaxRollExcel } from './parse-tax-roll-excel.js';
import { persistTaxRoll } from './persist-tax-roll.js';
import type { ParseTaxRollExcelResult } from './tax-roll-row.dto.js';
import type { PersistTaxRollResult } from './persist-tax-roll.js';

@Injectable()
export class TaxRollService {
  constructor(private readonly prisma: PrismaService) {}

  async import(
    buffer: Buffer,
    confirmReplace: boolean,
    fileName: string,
    administratorId: number,
    // Id de un TaxRollImport anterior (HU18): cuando el Administrador
    // confirma el reemplazo de un archivo que reporto conflictos, esta
    // llamada continua ese intento en vez de ser una carga nueva.
    previousImportId?: number,
  ) {
    const parsed = await this.parse(buffer);
    const persisted = await persistTaxRoll(
      this.prisma,
      parsed.validRows,
      confirmReplace,
    );
    const importId = await this.recordImport(
      fileName,
      administratorId,
      parsed,
      persisted,
      previousImportId,
    );
    return { ...parsed, persisted, importId };
  }

  // Un historial en /tax-roll/imports, mas reciente primero. Sin paginacion
  // por ahora: el limite basta para lo que el panel necesita mostrar.
  async listImports() {
    const imports = await this.prisma.taxRollImport.findMany({
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
    fileName: string,
    administratorId: number,
    parsed: ParseTaxRollExcelResult,
    persisted: PersistTaxRollResult,
    previousImportId?: number,
  ): Promise<number> {
    const data = {
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
      // El where incluye fileName/administratorId ademas del id como
      // resguardo minimo: si el id no corresponde a ese archivo y ese
      // admin, no se actualiza nada y se cae al create de abajo.
      const updated = await this.prisma.taxRollImport.updateMany({
        where: { id: previousImportId, fileName, administratorId },
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
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Could not read the Excel file.',
      );
    }
  }
}
