-- CreateTable
CREATE TABLE "template_drafts" (
    "id" TEXT NOT NULL,
    "documentType" "PdfDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "municipalityId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "template_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_drafts_expiresAt_idx" ON "template_drafts"("expiresAt");

-- AddForeignKey
ALTER TABLE "template_drafts" ADD CONSTRAINT "template_drafts_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_drafts" ADD CONSTRAINT "template_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "administrators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
