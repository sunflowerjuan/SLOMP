-- DropIndex
DROP INDEX "settlements_propertyId_idx";

-- DropIndex
DROP INDEX "settlements_propertyId_period_key";

-- CreateIndex
CREATE INDEX "settlements_propertyId_period_idx" ON "settlements"("propertyId", "period");
