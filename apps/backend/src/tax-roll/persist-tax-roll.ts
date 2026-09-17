import type { PrismaService } from '../prisma/prisma.service.js';
import type { TaxRollRowDto } from './tax-roll-row.dto.js';

export interface PersistTaxRollResult {
  properties: number;
  owners: number;
  settlements: number;
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
): Promise<PersistTaxRollResult> {
  if (rows.length === 0) {
    return { properties: 0, owners: 0, settlements: 0 };
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
  for (const row of rows) {
    rowByCadastralCode.set(row.cadastralCode, row);
    rowByTaxId.set(row.taxId, row);
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

  const settlementKey = (propertyId: number, period: number) =>
    `${propertyId}:${period}`;
  const existingSettlements = await prisma.settlement.findMany({
    where: { propertyId: { in: [...propertyIdByCode.values()] } },
    select: { id: true, propertyId: true, period: true },
  });
  const existingSettlementIdByKey = new Map(
    existingSettlements.map((s) => [
      settlementKey(s.propertyId, Number(s.period)),
      s.id,
    ]),
  );

  const rowsToCreate: { row: TaxRollRowDto; propertyId: number }[] = [];
  const rowsToUpdate: {
    row: TaxRollRowDto;
    propertyId: number;
    settlementId: number;
  }[] = [];
  for (const row of rows) {
    const propertyId = propertyIdByCode.get(row.cadastralCode)!;
    const existingId = existingSettlementIdByKey.get(
      settlementKey(propertyId, row.period),
    );
    if (existingId) {
      rowsToUpdate.push({ row, propertyId, settlementId: existingId });
    } else {
      rowsToCreate.push({ row, propertyId });
    }
  }

  const detailsFor = (row: TaxRollRowDto, settlementId: number) =>
    SETTLEMENT_DETAIL_CONCEPTS.map(({ key, concept }) => ({
      settlementId,
      concept,
      amount: row[key],
    }));

  if (rowsToCreate.length > 0) {
    const created = await prisma.settlement.createManyAndReturn({
      data: rowsToCreate.map(({ row, propertyId }) => ({
        propertyId,
        period: String(row.period),
        totalAmount: row.total,
      })),
      select: { id: true, propertyId: true, period: true },
    });
    const createdIdByKey = new Map(
      created.map((s) => [settlementKey(s.propertyId, Number(s.period)), s.id]),
    );

    await prisma.settlementDetail.createMany({
      data: rowsToCreate.flatMap(({ row, propertyId }) =>
        detailsFor(
          row,
          createdIdByKey.get(settlementKey(propertyId, row.period))!,
        ),
      ),
    });
  }

  for (const { row, settlementId } of rowsToUpdate) {
    await prisma.$transaction([
      prisma.settlement.update({
        where: { id: settlementId },
        data: { totalAmount: row.total },
      }),
      prisma.settlementDetail.deleteMany({ where: { settlementId } }),
      prisma.settlementDetail.createMany({
        data: detailsFor(row, settlementId),
      }),
    ]);
  }

  return {
    properties: rowByCadastralCode.size,
    owners: rowByTaxId.size,
    settlements: rowsToCreate.length + rowsToUpdate.length,
  };
}
