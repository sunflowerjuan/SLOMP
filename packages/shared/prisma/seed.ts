import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DocumentType,
  LandUse,
  PrismaClient,
  SettlementStatus,
} from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BCRYPT_SALT_ROUNDS = 10;
// Dev-only fallback so `db:seed` works out of the box; override via env for
// anything that isn't a local machine.
const SEED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? "admin@paez-boyaca.gov.co";
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

// Standard surcharges on top of the unified property tax, as billed in most
// municipalities in Boyacá. Same 3 capital concepts the real tax-roll import
// creates (persist-tax-roll.ts) -- see the concept names in createSettlement
// below, which must match those exactly for anything (e.g. the liquidation
// PDF) that reads SettlementDetail.concept.
const FIREFIGHTER_SURCHARGE_RATE = 0.05; // "Sobretasa Bomberil"
const ENVIRONMENTAL_FEE_RATE = 0.02; // "C.A.R."
// Late-payment interest applied to overdue periods with a payment order,
// computed per concept (not on the combined total) -- again matching how
// the real import stores one "Interés X" row per capital concept.
const LATE_PAYMENT_INTEREST_RATE = 0.03;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main() {
  console.log("Cleaning up existing data...");
  await prisma.taxRollImport.deleteMany();
  await prisma.paymentOrder.deleteMany();
  await prisma.settlementDetail.deleteMany();
  await prisma.settlement.deleteMany();
  // Resolutions hold an onDelete: Restrict FK to properties -- must go
  // before property.deleteMany(), same reason settlements go first above.
  await prisma.resolution.deleteMany();
  await prisma.resolutionCounter.deleteMany();
  await prisma.propertyOwner.deleteMany();
  await prisma.property.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.municipality.deleteMany();
  await prisma.administrator.deleteMany();

  await prisma.administrator.create({
    data: {
      email: SEED_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS),
      name: "Administrador Páez",
    },
  });
  console.log(
    `Seeded administrator: ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`,
  );

  const municipality = await prisma.municipality.create({
    data: {
      name: "Páez",
      state: "Boyacá",
      daneCode: "15576",
    },
  });

  const [rincon, lopez, gomez, torres, martinez, agropecuaria] =
    await Promise.all([
      prisma.owner.create({
        data: {
          name: "Carlos Alberto Rincón Pérez",
          documentId: "9456123",
          documentType: DocumentType.CC,
          phone: "3112345678",
          email: "carlos.rincon@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "María Fernanda López Castro",
          documentId: "40587912",
          documentType: DocumentType.CC,
          phone: "3209876543",
          email: "maria.lopez@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "José Antonio Gómez Sánchez",
          documentId: "7134589",
          documentType: DocumentType.CC,
          phone: "3156781234",
          email: "jose.gomez@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "Luz Marina Torres Ramírez",
          documentId: "52698741",
          documentType: DocumentType.CC,
          phone: "3187654321",
          email: null,
        },
      }),
      prisma.owner.create({
        data: {
          name: "Édgar Iván Martínez Ruiz",
          documentId: "80234567",
          // Sin clasificación en la cartera: documentType queda NULL (SL-75).
          documentType: null,
          phone: null,
          email: "edgar.martinez@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "Agropecuaria Los Alpes S.A.S.",
          documentId: "900123456-1",
          documentType: DocumentType.NIT,
          phone: "3201122334",
          email: "contacto@agropecuarialosalpes.example.com",
        },
      }),
    ]);

  type PropertySeed = {
    cadastralCode: string;
    address: string;
    area: number;
    baseAmount2025: number; // unified property tax for the current period
    owners: { ownerId: number; percentage: number }[];
    history: number[]; // additional (inactive) periods
    hasPaymentOrder: boolean;
  };

  const propertiesSeed: PropertySeed[] = [
    {
      cadastralCode: "155760001000000010001",
      address: "Vereda El Chuscal, Finca La Esperanza",
      area: 45000.0,
      baseAmount2025: 680000,
      owners: [{ ownerId: rincon.id, percentage: 100 }],
      history: [2024, 2023],
      hasPaymentOrder: true,
    },
    {
      cadastralCode: "155760001000000020001",
      address: "Vereda Guanto, Finca San Isidro",
      area: 28000.5,
      baseAmount2025: 520000,
      owners: [
        { ownerId: rincon.id, percentage: 50 },
        { ownerId: lopez.id, percentage: 50 },
      ],
      history: [2024],
      hasPaymentOrder: false,
    },
    {
      cadastralCode: "155760002000010000001",
      address: "Calle 5 # 3-20, Centro",
      area: 180.0,
      baseAmount2025: 210000,
      owners: [{ ownerId: lopez.id, percentage: 100 }],
      history: [2024],
      hasPaymentOrder: false,
    },
    {
      cadastralCode: "155760002000020000001",
      address: "Carrera 4 # 2-15, Centro",
      area: 220.75,
      baseAmount2025: 265000,
      owners: [{ ownerId: gomez.id, percentage: 100 }],
      history: [2024],
      hasPaymentOrder: false,
    },
    {
      cadastralCode: "155760001000000030001",
      address: "Vereda Chuscal Alto, Finca Buenavista",
      area: 62000.0,
      baseAmount2025: 1150000,
      owners: [
        { ownerId: gomez.id, percentage: 40 },
        { ownerId: agropecuaria.id, percentage: 60 },
      ],
      history: [2024, 2023],
      hasPaymentOrder: true,
    },
    {
      cadastralCode: "155760001000000040001",
      address: "Vereda El Roble, Finca La Primavera",
      area: 15500.25,
      baseAmount2025: 395000,
      owners: [{ ownerId: torres.id, percentage: 100 }],
      history: [2024],
      hasPaymentOrder: false,
    },
    {
      cadastralCode: "155760001000000050001",
      address: "Vereda Guanto Bajo, Finca El Progreso",
      area: 19800.0,
      baseAmount2025: 310000,
      owners: [{ ownerId: martinez.id, percentage: 100 }],
      history: [],
      hasPaymentOrder: false,
    },
  ];

  let paymentOrderSeq = 1;

  for (const propertySeed of propertiesSeed) {
    const property = await prisma.property.create({
      data: {
        cadastralCode: propertySeed.cadastralCode,
        address: propertySeed.address,
        area: propertySeed.area,
        // Seed addresses in a "vereda" are rural; the rest are in the town centre.
        landUse: propertySeed.address.startsWith("Vereda")
          ? LandUse.RURAL
          : LandUse.URBAN,
        municipalityId: municipality.id,
      },
    });

    await prisma.propertyOwner.createMany({
      data: propertySeed.owners.map((o) => ({
        propertyId: property.id,
        ownerId: o.ownerId,
        percentage: o.percentage,
      })),
    });

    // Current period (2025): freshly issued, nothing paid yet.
    await createSettlement(
      property.id,
      2025,
      propertySeed.baseAmount2025,
      SettlementStatus.VIGENTE,
      false,
    );

    // Historical periods, with a slight year-over-year decrease. These are
    // distinct periods, never replacements of one another, so `replacedAt`
    // stays null on all of them -- only their payment status differs: paid
    // off by now, unless a mandamiento (PaymentOrder) is still open against
    // them, in which case the debt is still VIGENTE.
    const factors: Record<number, number> = { 2024: 0.96, 2023: 0.92 };
    for (const period of propertySeed.history) {
      const taxAmount = round2(
        propertySeed.baseAmount2025 * (factors[period] ?? 1),
      );
      const { settlementId } = await createSettlement(
        property.id,
        period,
        taxAmount,
        propertySeed.hasPaymentOrder
          ? SettlementStatus.VIGENTE
          : SettlementStatus.PAGADA,
        propertySeed.hasPaymentOrder,
      );

      if (propertySeed.hasPaymentOrder) {
        const number = `MP-${period}-${String(paymentOrderSeq).padStart(4, "0")}`;
        paymentOrderSeq += 1;
        await prisma.paymentOrder.create({
          data: {
            number,
            issuedAt: new Date(`${period + 1}-03-15`),
            settlementId,
          },
        });
      }
    }
  }

  console.log("Seed completed.");
}

function interestOn(amount: number, isOverdue: boolean): number {
  return isOverdue ? round2(amount * LATE_PAYMENT_INTEREST_RATE) : 0;
}

async function createSettlement(
  propertyId: number,
  period: number,
  propertyTaxAmount: number,
  status: SettlementStatus,
  isOverdue: boolean,
): Promise<{ settlementId: number }> {
  const firefighterSurcharge = round2(
    propertyTaxAmount * FIREFIGHTER_SURCHARGE_RATE,
  );
  const environmentalFee = round2(propertyTaxAmount * ENVIRONMENTAL_FEE_RATE);
  const propertyTaxInterest = interestOn(propertyTaxAmount, isOverdue);
  const environmentalFeeInterest = interestOn(environmentalFee, isOverdue);
  const firefighterSurchargeInterest = interestOn(
    firefighterSurcharge,
    isOverdue,
  );
  const totalAmount = round2(
    propertyTaxAmount +
      environmentalFee +
      firefighterSurcharge +
      propertyTaxInterest +
      environmentalFeeInterest +
      firefighterSurchargeInterest,
  );

  const settlement = await prisma.settlement.create({
    data: {
      propertyId,
      period,
      status,
      issuedAt: new Date(`${period}-02-01`),
      totalAmount,
    },
  });

  // Same 6 concepts, in the same order, as persist-tax-roll.ts -- a blank/0
  // amount is a legitimate value (e.g. no interest on a current, non-overdue
  // period), not something omitted here.
  const details = [
    { concept: "Impuesto Predial", amount: propertyTaxAmount },
    { concept: "Interés Impuesto Predial", amount: propertyTaxInterest },
    { concept: "C.A.R.", amount: environmentalFee },
    { concept: "Interés C.A.R.", amount: environmentalFeeInterest },
    { concept: "Sobretasa Bomberil", amount: firefighterSurcharge },
    {
      concept: "Interés Sobretasa Bomberil",
      amount: firefighterSurchargeInterest,
    },
  ];

  await prisma.settlementDetail.createMany({
    data: details.map((d) => ({ ...d, settlementId: settlement.id })),
  });

  return { settlementId: settlement.id };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
