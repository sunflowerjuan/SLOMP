import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SettlementStatus } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BCRYPT_SALT_ROUNDS = 10;
// Dev-only fallback so `db:seed` works out of the box; override via env for
// anything that isn't a local machine.
const SEED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? "admin@paez-boyaca.gov.co";
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

// "Firefighter surcharge": standard 5% surcharge on top of the unified
// property tax, as billed in most municipalities in Boyacá.
const FIREFIGHTER_SURCHARGE_RATE = 0.05;
// Late-payment interest applied to overdue periods with a payment order.
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
          phone: "3112345678",
          email: "carlos.rincon@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "María Fernanda López Castro",
          documentId: "40587912",
          phone: "3209876543",
          email: "maria.lopez@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "José Antonio Gómez Sánchez",
          documentId: "7134589",
          phone: "3156781234",
          email: "jose.gomez@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "Luz Marina Torres Ramírez",
          documentId: "52698741",
          phone: "3187654321",
          email: null,
        },
      }),
      prisma.owner.create({
        data: {
          name: "Édgar Iván Martínez Ruiz",
          documentId: "80234567",
          phone: null,
          email: "edgar.martinez@example.com",
        },
      }),
      prisma.owner.create({
        data: {
          name: "Agropecuaria Los Alpes S.A.S.",
          documentId: "900123456-1",
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
    history: string[]; // additional (inactive) periods
    hasPaymentOrder: boolean;
  };

  const propertiesSeed: PropertySeed[] = [
    {
      cadastralCode: "155760001000000010001",
      address: "Vereda El Chuscal, Finca La Esperanza",
      area: 45000.0,
      baseAmount2025: 680000,
      owners: [{ ownerId: rincon.id, percentage: 100 }],
      history: ["2024", "2023"],
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
      history: ["2024"],
      hasPaymentOrder: false,
    },
    {
      cadastralCode: "155760002000010000001",
      address: "Calle 5 # 3-20, Centro",
      area: 180.0,
      baseAmount2025: 210000,
      owners: [{ ownerId: lopez.id, percentage: 100 }],
      history: ["2024"],
      hasPaymentOrder: false,
    },
    {
      cadastralCode: "155760002000020000001",
      address: "Carrera 4 # 2-15, Centro",
      area: 220.75,
      baseAmount2025: 265000,
      owners: [{ ownerId: gomez.id, percentage: 100 }],
      history: ["2024"],
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
      history: ["2024", "2023"],
      hasPaymentOrder: true,
    },
    {
      cadastralCode: "155760001000000040001",
      address: "Vereda El Roble, Finca La Primavera",
      area: 15500.25,
      baseAmount2025: 395000,
      owners: [{ ownerId: torres.id, percentage: 100 }],
      history: ["2024"],
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

    // Current period (2025)
    await createSettlement(
      property.id,
      "2025",
      propertySeed.baseAmount2025,
      SettlementStatus.ACTIVE,
      false,
    );

    // Historical (inactive) periods, with a slight year-over-year decrease
    const factors: Record<string, number> = { "2024": 0.96, "2023": 0.92 };
    for (const period of propertySeed.history) {
      const taxAmount = round2(
        propertySeed.baseAmount2025 * (factors[period] ?? 1),
      );
      const { settlementId } = await createSettlement(
        property.id,
        period,
        taxAmount,
        SettlementStatus.INACTIVE,
        propertySeed.hasPaymentOrder,
      );

      if (propertySeed.hasPaymentOrder) {
        const number = `MP-${period}-${String(paymentOrderSeq).padStart(4, "0")}`;
        paymentOrderSeq += 1;
        await prisma.paymentOrder.create({
          data: {
            number,
            issuedAt: new Date(`${Number(period) + 1}-03-15`),
            settlementId,
          },
        });
      }
    }
  }

  console.log("Seed completed.");
}

async function createSettlement(
  propertyId: number,
  period: string,
  propertyTaxAmount: number,
  status: SettlementStatus,
  isOverdue: boolean,
): Promise<{ settlementId: number }> {
  const firefighterSurcharge = round2(
    propertyTaxAmount * FIREFIGHTER_SURCHARGE_RATE,
  );
  const latePaymentInterest = isOverdue
    ? round2(propertyTaxAmount * LATE_PAYMENT_INTEREST_RATE)
    : 0;
  const totalAmount = round2(
    propertyTaxAmount + firefighterSurcharge + latePaymentInterest,
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

  const details = [
    { concept: "Unified property tax", amount: propertyTaxAmount },
    { concept: "Firefighter surcharge", amount: firefighterSurcharge },
  ];
  if (isOverdue) {
    details.push({
      concept: "Late payment interest",
      amount: latePaymentInterest,
    });
  }

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
