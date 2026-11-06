-- A payment order covers the periods of one property that came in the same
-- generation, so it points to the property and each settlement points to its
-- payment order (a period belongs to at most one; a property can have
-- several). Orders can also link to the bulk job that issued them, so a
-- failed job deletes exactly its own.

-- 1. New columns, nullable so existing rows survive.
ALTER TABLE "payment_orders" ADD COLUMN "propertyId" INTEGER;
ALTER TABLE "payment_orders" ADD COLUMN "pdfJobId" TEXT;
ALTER TABLE "settlements" ADD COLUMN "paymentOrderId" INTEGER;

-- 2. Backfill from the old one-to-one link.
UPDATE "payment_orders" po SET "propertyId" = s."propertyId"
FROM "settlements" s WHERE s."id" = po."settlementId";

UPDATE "settlements" s SET "paymentOrderId" = po."id"
FROM "payment_orders" po WHERE po."settlementId" = s."id";

-- 3. Enforce what is now filled and drop the old link.
ALTER TABLE "payment_orders" ALTER COLUMN "propertyId" SET NOT NULL;
ALTER TABLE "payment_orders" DROP CONSTRAINT "payment_orders_settlementId_fkey";
DROP INDEX "payment_orders_settlementId_key";
ALTER TABLE "payment_orders" DROP COLUMN "settlementId";

-- 4. Indexes and foreign keys.
CREATE INDEX "payment_orders_propertyId_idx" ON "payment_orders"("propertyId");
CREATE INDEX "payment_orders_pdfJobId_idx" ON "payment_orders"("pdfJobId");
CREATE INDEX "settlements_paymentOrderId_idx" ON "settlements"("paymentOrderId");

ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_pdfJobId_fkey" FOREIGN KEY ("pdfJobId") REFERENCES "pdf_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
