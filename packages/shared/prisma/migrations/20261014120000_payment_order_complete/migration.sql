-- Complete PaymentOrder (mandamiento de pago): at most one per settlement,
-- owned by a municipality, with a consecutive that restarts every year in
-- each municipality. Existing rows are backfilled; the migration aborts,
-- changing nothing, when that cannot be done safely.

-- 1. New columns, nullable so existing rows survive.
ALTER TABLE "payment_orders" ADD COLUMN "municipalityId" INTEGER;
ALTER TABLE "payment_orders" ADD COLUMN "year" INTEGER;
ALTER TABLE "payment_orders" ADD COLUMN "sequence" INTEGER;
ALTER TABLE "payment_orders" ADD COLUMN "administratorId" INTEGER;

-- 2. A settlement can have at most one payment order from now on.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "payment_orders" GROUP BY "settlementId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A settlement has more than one payment order. Keep one per settlement before migrating.';
  END IF;
END $$;

-- 3. Backfill: the municipality of the settlement's property; the year of the
--    generation date in Colombia; the sequence in order of creation. The old
--    free-text numbers (seed data only, nothing generated them before) are
--    replaced by the new <year>-<sequence> numbers.
UPDATE "payment_orders" po SET "municipalityId" = p."municipalityId"
FROM "settlements" s
JOIN "properties" p ON p."id" = s."propertyId"
WHERE s."id" = po."settlementId";

UPDATE "payment_orders"
SET "year" = EXTRACT(YEAR FROM "issuedAt" AT TIME ZONE 'America/Bogota')::INTEGER;

UPDATE "payment_orders" po SET "sequence" = numbered."sequence"
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "municipalityId", "year" ORDER BY "issuedAt", "id"
  )::INTEGER AS "sequence"
  FROM "payment_orders"
) numbered
WHERE numbered."id" = po."id";

UPDATE "payment_orders"
SET "number" = "year"::TEXT || '-' || lpad("sequence"::TEXT, 4, '0');

-- 4. The counter, one row per municipality and year.
CREATE TABLE "payment_order_counters" (
    "municipalityId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_order_counters_pkey" PRIMARY KEY ("municipalityId","year")
);

INSERT INTO "payment_order_counters" ("municipalityId", "year", "lastSequence")
SELECT "municipalityId", "year", max("sequence") FROM "payment_orders" GROUP BY "municipalityId", "year";

-- 5. Enforce what is now filled.
ALTER TABLE "payment_orders" ALTER COLUMN "municipalityId" SET NOT NULL;
ALTER TABLE "payment_orders" ALTER COLUMN "year" SET NOT NULL;
ALTER TABLE "payment_orders" ALTER COLUMN "sequence" SET NOT NULL;

-- 6. Uniqueness: one per settlement, and the number per municipality.
DROP INDEX "payment_orders_number_key";
DROP INDEX "payment_orders_settlementId_idx";

CREATE UNIQUE INDEX "payment_orders_settlementId_key" ON "payment_orders"("settlementId");
CREATE UNIQUE INDEX "payment_orders_municipalityId_number_key" ON "payment_orders"("municipalityId", "number");
CREATE UNIQUE INDEX "payment_orders_municipalityId_year_sequence_key" ON "payment_orders"("municipalityId", "year", "sequence");
CREATE INDEX "payment_orders_municipalityId_issuedAt_idx" ON "payment_orders"("municipalityId", "issuedAt");

-- 7. Foreign keys.
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_order_counters" ADD CONSTRAINT "payment_order_counters_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
