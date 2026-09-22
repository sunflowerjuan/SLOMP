-- CreateTable
CREATE TABLE "tax_roll_imports" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "warnings" INTEGER NOT NULL,
    "properties" INTEGER NOT NULL,
    "owners" INTEGER NOT NULL,
    "settlements" INTEGER NOT NULL,
    "conflicts" INTEGER NOT NULL,
    "administratorId" INTEGER,

    CONSTRAINT "tax_roll_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_roll_imports_importedAt_idx" ON "tax_roll_imports"("importedAt");

-- AddForeignKey
ALTER TABLE "tax_roll_imports" ADD CONSTRAINT "tax_roll_imports_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
