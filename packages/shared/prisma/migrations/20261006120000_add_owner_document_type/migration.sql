-- SL-75 (HU21): owner document type (DIAN document types).

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RC', 'TI', 'CC', 'TE', 'CE', 'NIT', 'PA', 'TDE', 'PEP', 'PPT', 'NUIP');

-- AlterTable
-- Nullable and with no default: the classification is optional in the tax
-- roll, and it's never assumed. Owners already loaded (e.g. Páez's real
-- tax roll) keep every value and start with NULL; the next import fills in
-- the ones whose CCNIT states a type.
ALTER TABLE "owners" ADD COLUMN "documentType" "DocumentType";
