-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "municipalities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT,
    "daneCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" SERIAL NOT NULL,
    "cadastralCode" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "municipalityId" INTEGER NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_owners" (
    "propertyId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_owners_pkey" PRIMARY KEY ("propertyId","ownerId")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" SERIAL NOT NULL,
    "period" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyId" INTEGER NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_details" (
    "id" SERIAL NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementId" INTEGER NOT NULL,

    CONSTRAINT "settlement_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settlementId" INTEGER NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_daneCode_key" ON "municipalities"("daneCode");

-- CreateIndex
CREATE UNIQUE INDEX "properties_cadastralCode_key" ON "properties"("cadastralCode");

-- CreateIndex
CREATE INDEX "properties_municipalityId_idx" ON "properties"("municipalityId");

-- CreateIndex
CREATE UNIQUE INDEX "owners_documentId_key" ON "owners"("documentId");

-- CreateIndex
CREATE INDEX "settlements_propertyId_idx" ON "settlements"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_propertyId_period_key" ON "settlements"("propertyId", "period");

-- CreateIndex
CREATE INDEX "settlement_details_settlementId_idx" ON "settlement_details"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_number_key" ON "payment_orders"("number");

-- CreateIndex
CREATE INDEX "payment_orders_settlementId_idx" ON "payment_orders"("settlementId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_details" ADD CONSTRAINT "settlement_details_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
