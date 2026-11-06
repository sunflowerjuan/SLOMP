-- AlterTable
-- period was free text; the tax roll only has annual periods (1980-2026 in the
-- sample workbook), so it becomes an integer year. Fails loudly if any row
-- holds a non-numeric value.
ALTER TABLE "settlements" ALTER COLUMN "period" SET DATA TYPE INTEGER USING "period"::integer;
