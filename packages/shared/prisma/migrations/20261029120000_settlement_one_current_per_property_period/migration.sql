-- At most one current (not replaced) settlement per property and period
-- (ADR-10, SL-190). Replaced rows stay as history, so the full unique index
-- dropped in 20260917022054 cannot come back; Prisma's schema can't express a
-- partial unique index. Fails if duplicates already exist: resolve them first.
CREATE UNIQUE INDEX "settlements_one_current_per_property_period" ON "settlements"("propertyId", "period")
  WHERE "replacedAt" IS NULL;
