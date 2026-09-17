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

  const conflicts: TaxRollConflict[] = [];
  const toInactivate: number[] = [];
  const rowsToCreate: { row: TaxRollRowDto; propertyId: number }[] = [];

  for (const row of rowByPropertyPeriod.values()) {
    const propertyId = propertyIdByCode.get(row.cadastralCode)!;
    const activeId = activeIdByPropertyPeriod.get(
      `${propertyId}:${row.period}`,
    );

    if (!activeId) {
      rowsToCreate.push({ row, propertyId });
      continue;
    }

    if (!confirmReplace) {
      conflicts.push({ cadastralCode: row.cadastralCode, period: row.period });
      continue;
    }

    toInactivate.push(activeId);
    rowsToCreate.push({ row, propertyId });
  }

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
