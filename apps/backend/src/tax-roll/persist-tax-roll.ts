import { SettlementStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TaxRollRowDto } from './tax-roll-row.dto.js';

export interface TaxRollConflict {
  cadastralCode: string;
  period: number;
}

export interface PersistTaxRollResult {
  properties: number;
  owners: number;
  // 0 whenever `conflicts` is non-empty and the caller hasn't passed
  // confirmReplace yet: this pass persists nothing at all -- not even the
  // rows that don't conflict -- so the Administrator can cancel without
  // any partial write (HU18).
  settlements: number;
  // Property+period pairs that already had an ACTIVE settlement and were
  // left untouched because the caller didn't pass confirmReplace — the
  // Administrator has to see these and confirm before they're replaced.
  conflicts: TaxRollConflict[];
}

// Order mirrors the source columns; the amounts (interest included) are
// stored exactly as the file states them — never recomputed.
const SETTLEMENT_DETAIL_CONCEPTS: {
  key:
    | 'propertyTax'
    | 'propertyTaxInterest'
    | 'environmentalFee'
    | 'environmentalFeeInterest'
    | 'fireSurcharge'
    | 'fireSurchargeInterest';
  concept: string;
}[] = [
  { key: 'propertyTax', concept: 'Impuesto Predial' },
  { key: 'propertyTaxInterest', concept: 'Interés Impuesto Predial' },
  { key: 'environmentalFee', concept: 'C.A.R.' },
  { key: 'environmentalFeeInterest', concept: 'Interés C.A.R.' },
  { key: 'fireSurcharge', concept: 'Sobretasa Bomberil' },
  { key: 'fireSurchargeInterest', concept: 'Interés Sobretasa Bomberil' },
];

const NO_OWNER_NAME_PLACEHOLDER = 'Propietario sin nombre registrado';

export async function persistTaxRoll(
  prisma: PrismaService,
  rows: TaxRollRowDto[],
  confirmReplace: boolean,
): Promise<PersistTaxRollResult> {
  if (rows.length === 0) {
    return { properties: 0, owners: 0, settlements: 0, conflicts: [] };
  }

  const municipality = await prisma.municipality.findFirst();
  if (!municipality) {
    throw new Error(
      'No municipality is configured yet. Seed the database before importing a tax roll.',
    );
  }

  // The file repeats the same property/owner across periods; keep the last
  // occurrence of each so a single upsert per property/owner is enough.
  const rowByCadastralCode = new Map<string, TaxRollRowDto>();
  const rowByTaxId = new Map<string, TaxRollRowDto>();
  // A property+period should only ever be processed once per import, even
  // if the source file has a duplicate row for it — otherwise two "new"
  // settlements could both be created as ACTIVE for the same period.
  const rowByPropertyPeriod = new Map<string, TaxRollRowDto>();
  for (const row of rows) {
    rowByCadastralCode.set(row.cadastralCode, row);
    rowByTaxId.set(row.taxId, row);
    rowByPropertyPeriod.set(`${row.cadastralCode}:${row.period}`, row);
  }

  await Promise.all(
    [...rowByCadastralCode.values()].map((row) =>
      prisma.property.upsert({
        where: { cadastralCode: row.cadastralCode },
        create: {
          cadastralCode: row.cadastralCode,
          address: row.propertyName,
          landUse: row.landUse || null,
          appraisalValue: row.appraisalValue,
          municipalityId: municipality.id,
        },
        update: {
          address: row.propertyName,
          landUse: row.landUse || null,
          appraisalValue: row.appraisalValue,
        },
      }),
    ),
  );

  await Promise.all(
    [...rowByTaxId.values()].map((row) =>
      prisma.owner.upsert({
        where: { documentId: row.taxId },
        create: {
          documentId: row.taxId,
          name: row.ownerName ?? NO_OWNER_NAME_PLACEHOLDER,
        },
        update: row.ownerName ? { name: row.ownerName } : {},
      }),
    ),
  );

  const properties = await prisma.property.findMany({
    where: { cadastralCode: { in: [...rowByCadastralCode.keys()] } },
    select: { id: true, cadastralCode: true },
  });
  const propertyIdByCode = new Map(
    properties.map((p) => [p.cadastralCode, p.id]),
  );

  const owners = await prisma.owner.findMany({
    where: { documentId: { in: [...rowByTaxId.keys()] } },
    select: { id: true, documentId: true },
  });
  const ownerIdByTaxId = new Map(owners.map((o) => [o.documentId, o.id]));

  await prisma.propertyOwner.createMany({
    data: [...rowByCadastralCode.entries()].map(([cadastralCode, row]) => ({
      propertyId: propertyIdByCode.get(cadastralCode)!,
      ownerId: ownerIdByTaxId.get(row.taxId)!,
      percentage: 100,
    })),
    skipDuplicates: true,
  });

  // Only an ACTIVE settlement can conflict — an already-replaced (INACTIVE)
  // one for the same property+period is just history.
  const activeSettlements = await prisma.settlement.findMany({
    where: {
      propertyId: { in: [...propertyIdByCode.values()] },
      status: SettlementStatus.ACTIVE,
    },
    select: { id: true, propertyId: true, period: true },
  });
  const activeIdByPropertyPeriod = new Map(
    activeSettlements.map((s) => [`${s.propertyId}:${s.period}`, s.id]),
  );

  const classifiedRows = [...rowByPropertyPeriod.values()].map((row) => {
    const propertyId = propertyIdByCode.get(row.cadastralCode)!;
    const activeId = activeIdByPropertyPeriod.get(
      `${propertyId}:${row.period}`,
    );
    return { row, propertyId, activeId };
  });
  const conflictingRows = classifiedRows.filter(
    (entry) => entry.activeId !== undefined,
  );

  // Si hay conflictos y quien llama todavia no confirmo el reemplazo, esta
  // pasada no crea NINGUNA liquidacion -- ni siquiera las de predios y
  // periodos sin conflicto. El Administrador ve el aviso completo antes de
  // que se persista cualquier cosa (HU18); solo la llamada que confirma (o
  // una que de entrada no encuentra ningun conflicto) escribe settlements.
  const shouldPersistSettlements =
    confirmReplace || conflictingRows.length === 0;

  // `conflicts` solo reporta pendientes -- una vez confirmado ya no hay
  // nada esperando confirmacion, aunque esas filas si tenian activeId.
  const conflicts: TaxRollConflict[] = shouldPersistSettlements
    ? []
    : conflictingRows.map((entry) => ({
        cadastralCode: entry.row.cadastralCode,
        period: entry.row.period,
      }));

  const rowsToCreate = shouldPersistSettlements
    ? classifiedRows.map(({ row, propertyId }) => ({ row, propertyId }))
    : [];
  const toInactivate = shouldPersistSettlements
    ? conflictingRows.map((entry) => entry.activeId!)
    : [];

  if (toInactivate.length > 0) {
    await prisma.settlement.updateMany({
      where: { id: { in: toInactivate } },
      data: { status: SettlementStatus.INACTIVE },
    });
  }

  if (rowsToCreate.length > 0) {
    const created = await prisma.settlement.createManyAndReturn({
      data: rowsToCreate.map(({ row, propertyId }) => ({
        propertyId,
        period: String(row.period),
        totalAmount: row.total,
        status: SettlementStatus.ACTIVE,
      })),
      select: { id: true, propertyId: true, period: true },
    });
    const createdIdByPropertyPeriod = new Map(
      created.map((s) => [`${s.propertyId}:${s.period}`, s.id]),
    );

    await prisma.settlementDetail.createMany({
      data: rowsToCreate.flatMap(({ row, propertyId }) =>
        SETTLEMENT_DETAIL_CONCEPTS.map(({ key, concept }) => ({
          settlementId: createdIdByPropertyPeriod.get(
            `${propertyId}:${row.period}`,
          )!,
          concept,
          amount: row[key],
        })),
      ),
    });
  }

  return {
    properties: rowByCadastralCode.size,
    owners: rowByTaxId.size,
    settlements: rowsToCreate.length,
    conflicts,
  };
}
