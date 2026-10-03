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
  // any partial write.
  settlements: number;
  // Property+period pairs that already had a current (non-replaced)
  // settlement and were left untouched because the caller didn't pass
  // confirmReplace — the Administrator has to see these and confirm before
  // they're replaced.
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
  // settlements could both be created as current for the same period.
  const rowByPropertyPeriod = new Map<string, TaxRollRowDto>();
  for (const row of rows) {
    const previousPropertyRow = rowByCadastralCode.get(row.cadastralCode);
    rowByCadastralCode.set(row.cadastralCode, {
      ...row,
      ruralDistrict:
        row.ruralDistrict ?? previousPropertyRow?.ruralDistrict ?? null,
      neighborhood:
        row.neighborhood ?? previousPropertyRow?.neighborhood ?? null,
      latitude: row.latitude ?? previousPropertyRow?.latitude ?? null,
      longitude: row.longitude ?? previousPropertyRow?.longitude ?? null,
    });
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
          ruralDistrict: row.ruralDistrict,
          neighborhood: row.neighborhood,
          latitude: row.latitude,
          longitude: row.longitude,
          landUse: row.landUse || null,
          appraisalValue: row.appraisalValue,
          municipalityId: municipality.id,
        },
        update: {
          address: row.propertyName,
          ...(row.ruralDistrict !== null && {
            ruralDistrict: row.ruralDistrict,
          }),
          ...(row.neighborhood !== null && {
            neighborhood: row.neighborhood,
          }),
          ...(row.latitude !== null && { latitude: row.latitude }),
          ...(row.longitude !== null && { longitude: row.longitude }),
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

  // Only a current (non-replaced) settlement can conflict — a settlement
  // already replaced by an earlier import for the same property+period is
  // just history (replacedAt is set, regardless of its payment status).
  const currentSettlements = await prisma.settlement.findMany({
    where: {
      propertyId: { in: [...propertyIdByCode.values()] },
      replacedAt: null,
    },
    select: { id: true, propertyId: true, period: true },
  });
  const currentIdByPropertyPeriod = new Map(
    currentSettlements.map((s) => [`${s.propertyId}:${s.period}`, s.id]),
  );

  const classifiedRows = [...rowByPropertyPeriod.values()].map((row) => {
    const propertyId = propertyIdByCode.get(row.cadastralCode)!;
    const currentId = currentIdByPropertyPeriod.get(
      `${propertyId}:${row.period}`,
    );
    return { row, propertyId, currentId };
  });
  const conflictingRows = classifiedRows.filter(
    (entry) => entry.currentId !== undefined,
  );

  // If there are conflicts and the caller hasn't confirmed the replacement
  // yet, this pass creates NO settlement at all -- not even the ones for
  // properties/periods without conflicts. The Administrator sees the full
  // warning before anything gets persisted; only the call that confirms
  // (or one that finds no conflict at all) writes settlements.
  const shouldPersistSettlements =
    confirmReplace || conflictingRows.length === 0;

  // `conflicts` only reports what's still pending -- once confirmed there's
  // nothing left waiting for confirmation, even though those rows did have
  // a currentId.
  const conflicts: TaxRollConflict[] = shouldPersistSettlements
    ? []
    : conflictingRows.map((entry) => ({
        cadastralCode: entry.row.cadastralCode,
        period: entry.row.period,
      }));

  const rowsToCreate = shouldPersistSettlements
    ? classifiedRows.map(({ row, propertyId }) => ({ row, propertyId }))
    : [];
  const toSupersede = shouldPersistSettlements
    ? conflictingRows.map((entry) => entry.currentId!)
    : [];

  if (toSupersede.length > 0) {
    await prisma.settlement.updateMany({
      where: { id: { in: toSupersede } },
      data: { replacedAt: new Date() },
    });
  }

  if (rowsToCreate.length > 0) {
    const created = await prisma.settlement.createManyAndReturn({
      data: rowsToCreate.map(({ row, propertyId }) => ({
        propertyId,
        period: row.period,
        totalAmount: row.total,
        status: SettlementStatus.VIGENTE,
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
