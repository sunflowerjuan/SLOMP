-- CreateTable
CREATE TABLE "templates" (
    "id" SERIAL NOT NULL,
    "documentType" "PdfDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "blobPath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fields" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "municipalityId" INTEGER NOT NULL,
    "uploadedById" INTEGER,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "templates_municipalityId_documentType_version_key" ON "templates"("municipalityId", "documentType", "version");

-- At most one active version per municipality and document type (Prisma
-- cannot express a partial unique index).
CREATE UNIQUE INDEX "templates_one_active_per_type" ON "templates"("municipalityId", "documentType") WHERE "isActive";

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
