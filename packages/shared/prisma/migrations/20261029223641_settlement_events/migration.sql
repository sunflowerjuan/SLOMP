-- Audit of settlement status changes (first layer of the history): one row per
-- change made by an Administrator, by hand (MANUAL) or confirmed from a
-- Slompsim proposal (ASSISTANT). Append-only; written in the same transaction
-- as the change.

-- CreateEnum
CREATE TYPE "SettlementEventType" AS ENUM ('STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "SettlementEventSource" AS ENUM ('MANUAL', 'ASSISTANT');

-- CreateTable
CREATE TABLE "settlement_events" (
    "id" SERIAL NOT NULL,
    "type" "SettlementEventType" NOT NULL,
    "fromStatus" "SettlementStatus" NOT NULL,
    "toStatus" "SettlementStatus" NOT NULL,
    "source" "SettlementEventSource" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settlementId" INTEGER NOT NULL,
    "municipalityId" INTEGER NOT NULL,
    "administratorId" INTEGER,

    CONSTRAINT "settlement_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_events_settlementId_createdAt_idx" ON "settlement_events"("settlementId", "createdAt");

-- CreateIndex
CREATE INDEX "settlement_events_municipalityId_createdAt_idx" ON "settlement_events"("municipalityId", "createdAt");

-- CreateIndex
CREATE INDEX "settlement_events_administratorId_idx" ON "settlement_events"("administratorId");

-- AddForeignKey
ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
