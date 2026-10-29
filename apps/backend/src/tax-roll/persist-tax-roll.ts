import { type Prisma, SettlementStatus } from '@prisma/client';
import type { TaxRollRowDto } from './tax-roll-row.dto.js';
import { CodedError } from '../common/errors/coded-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { findMissingPeriods } from './missing-periods.js';

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
  // Property+period pairs whose current settlement is EN_FIRME: a final
  // liquidation is never replaced from a tax roll, so these rows are skipped
  // (never a conflict to confirm) and reported here.
  locked: TaxRollConflict[];
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

export const NO_OWNER_NAME_PLACEHOLDER = 'Propietario sin nombre registrado';

export async function persistTaxRoll(
  prisma: Prisma.TransactionClient,
  municipalityId: number,
  rows: TaxRollRowDto[],
  confirmReplace: boolean,
): Promise<PersistTaxRollResult> {
  if (rows.length === 0) {
    return {
      properties: 0,
      owners: 0,
      settlements: 0,
      conflicts: [],
      locked: [],
    };
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
      landUse: row.landUse ?? previousPropertyRow?.landUse ?? null,
    });
    rowByTaxId.set(row.taxId, row);
    rowByPropertyPeriod.set(`${row.cadastralCode}:${row.period}`, row);
  }

  // cadastralCode is unique across the whole system, so an upsert by code
  // would silently edit a property of another municipality. The DANE prefix
  // check normally prevents this; this keeps the isolation even for legacy
  // data whose code does not match its municipality.
  const foreignProperties = await prisma.property.findMany({
    where: {
      cadastralCode: { in: [...rowByCadastralCode.keys()] },
      municipalityId: { not: municipalityId },
    },
    select: { cadastralCode: true },
  });
  if (foreignProperties.length > 0) {
    throw new CodedError(
      ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY,
      'Some cadastral codes in this file already belong to another municipality.',
      { mismatchedRows: foreignProperties.length },
    );
  }

  // One after another: they run on the import's transaction connection, which
  // takes a single query at a time.
  for (const row of rowByCadastralCode.values()) {
    await prisma.property.upsert({
      where: { cadastralCode: row.cadastralCode },
      create: {
        cadastralCode: row.cadastralCode,
        address: row.propertyName,
        ruralDistrict: row.ruralDistrict,
        neighborhood: row.neighborhood,
        latitude: row.latitude,
        longitude: row.longitude,
        landUse: row.landUse,
        appraisalValue: row.appraisalValue,
        municipalityId,
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
        // An unrecognized value in a later file must not erase a known one.
        ...(row.landUse !== null && { landUse: row.landUse }),
        appraisalValue: row.appraisalValue,
      },
    });
  }

  for (const row of rowByTaxId.values()) {
    await prisma.owner.upsert({
      where: {
        municipalityId_documentId: { municipalityId, documentId: row.taxId },
      },
      create: {
        municipalityId,
        documentId: row.taxId,
        documentType: row.documentType,
        name: row.ownerName ?? NO_OWNER_NAME_PLACEHOLDER,
      },
      // Same rule as the name: what the file states wins, but a row that
      // states nothing never erases what's already known (SL-75).
      update: {
        ...(row.ownerName && { name: row.ownerName }),
        ...(row.documentType && { documentType: row.documentType }),
      },
    });
  }

  const properties = await prisma.property.findMany({
    where: {
      municipalityId,
      cadastralCode: { in: [...rowByCadastralCode.keys()] },
    },
    select: { id: true, cadastralCode: true },
  });
  const propertyIdByCode = new Map(
    properties.map((p) => [p.cadastralCode, p.id]),
  );

  const owners = await prisma.owner.findMany({
    where: { municipalityId, documentId: { in: [...rowByTaxId.keys()] } },
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
      property: { municipalityId },
      replacedAt: null,
    },
    select: {
      id: true,
      propertyId: true,
      period: true,
      status: true,
      missingSince: true,
    },
  });
  const currentByPropertyPeriod = new Map(
    currentSettlements.map((s) => [`${s.propertyId}:${s.period}`, s]),
  );

  const allClassifiedRows = [...rowByPropertyPeriod.values()].map((row) => {
    const propertyId = propertyIdByCode.get(row.cadastralCode)!;
    const current = currentByPropertyPeriod.get(`${propertyId}:${row.period}`);
    return { row, propertyId, currentId: current?.id, current };
  });
  const lockedRows = allClassifiedRows.filter(
    (entry) => entry.current?.status === SettlementStatus.EN_FIRME,
  );
  const classifiedRows = allClassifiedRows.filter(
    (entry) => entry.current?.status !== SettlementStatus.EN_FIRME,
  );
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
      where: { id: { in: toSupersede }, property: { municipalityId } },
      data: { replacedAt: new Date() },
    });
  }

  // Periods this import no longer brings for a property it does bring. Only
  // on the pass that writes settlements, and keeping the date of the first
  // import that missed each one.
  const newlyMissing = shouldPersistSettlements
    ? findMissingPeriods(
        currentSettlements.filter((s) => s.missingSince == null),
        allClassifiedRows.map(({ row, propertyId }) => ({
          propertyId,
          period: row.period,
        })),
      )
    : [];
  if (newlyMissing.length > 0) {
    await prisma.settlement.updateMany({
      where: {
        id: { in: newlyMissing.map((s) => s.id) },
        property: { municipalityId },
      },
      data: { missingSince: new Date() },
    });
  }

  // Two statements for the whole file, with one array per column: Prisma
  // keeps the arguments of its last 100 queries in memory (its debug history,
  // even with logging off), and createMany, one object per row, kept ~250 MiB
  // of the Páez roll alive after the load (SL-190).
  if (rowsToCreate.length > 0) {
    const created = await prisma.$queryRaw<
      { id: number; propertyId: number; period: number }[]
    >`
      INSERT INTO "settlements" ("propertyId", "period", "totalAmount", "status", "updatedAt")
      SELECT r.*, ${SettlementStatus.VIGENTE}::"SettlementStatus", now()
      FROM unnest(
        ${rowsToCreate.map((entry) => entry.propertyId)}::int[],
        ${rowsToCreate.map((entry) => entry.row.period)}::int[],
        ${rowsToCreate.map((entry) => entry.row.total)}::numeric[]
      ) AS r
      RETURNING "id", "propertyId", "period"`;
    const createdIdByPropertyPeriod = new Map(
      created.map((s) => [`${s.propertyId}:${s.period}`, s.id]),
    );

    const details = rowsToCreate.flatMap(({ row, propertyId }) =>
      SETTLEMENT_DETAIL_CONCEPTS.map(({ key, concept }) => ({
        settlementId: createdIdByPropertyPeriod.get(
          `${propertyId}:${row.period}`,
        )!,
        concept,
        amount: row[key],
      })),
    );
    await prisma.$executeRaw`
      INSERT INTO "settlement_details" ("settlementId", "concept", "amount")
      SELECT * FROM unnest(
        ${details.map((d) => d.settlementId)}::int[],
        ${details.map((d) => d.concept)}::text[],
        ${details.map((d) => d.amount)}::numeric[]
      )`;
  }

  return {
    properties: rowByCadastralCode.size,
    owners: rowByTaxId.size,
    settlements: rowsToCreate.length,
    conflicts,
    locked: lockedRows.map((entry) => ({
      cadastralCode: entry.row.cadastralCode,
      period: entry.row.period,
    })),
  };
}
