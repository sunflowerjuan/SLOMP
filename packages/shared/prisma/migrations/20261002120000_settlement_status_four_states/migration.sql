-- ADR-6/RF-10 resolution (see ADR-10 in Confluence): "Inactiva" is not one
-- of the 4 real ERS states. A replaced settlement keeps whatever payment
-- status it already had; `replacedAt` is the new, separate marker for "no
-- longer the current settlement of its property+period" (HU18/SL-58).
ALTER TABLE "settlements" ADD COLUMN "replacedAt" TIMESTAMP(3);

-- Backfill: previously-INACTIVE rows were replaced at some point -- reuse
-- updatedAt (the moment their status last changed) as the closest timestamp
-- we have for that.
UPDATE "settlements" SET "replacedAt" = "updatedAt" WHERE "status" = 'INACTIVE';

-- Replace the enum with the 4 real ERS states. We have no way to know the
-- true historical payment status of a previously-replaced (INACTIVE) row,
-- so it defaults to VIGENTE -- the least destructive assumption -- and the
-- `replacedAt` set above already keeps it out of "current settlement"
-- lookups regardless of what status it ends up with.
CREATE TYPE "SettlementStatus_new" AS ENUM ('VIGENTE', 'PAGADA', 'ACUERDO_DE_PAGO', 'PRESCRITA');

ALTER TABLE "settlements" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "settlements"
  ALTER COLUMN "status" TYPE "SettlementStatus_new"
  USING (CASE "status"::text
    WHEN 'ACTIVE' THEN 'VIGENTE'
    WHEN 'INACTIVE' THEN 'VIGENTE'
  END)::"SettlementStatus_new";
ALTER TABLE "settlements" ALTER COLUMN "status" SET DEFAULT 'VIGENTE';

DROP TYPE "SettlementStatus";
ALTER TYPE "SettlementStatus_new" RENAME TO "SettlementStatus";
