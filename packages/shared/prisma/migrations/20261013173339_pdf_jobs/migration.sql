-- CreateEnum
CREATE TYPE "PdfJobStatus" AS ENUM ('PREPARING', 'RUNNING', 'ASSEMBLING', 'DONE', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PdfDocumentType" AS ENUM ('LIQUIDACION', 'MANDAMIENTO');

-- CreateEnum
CREATE TYPE "PdfBatchStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "resolutions" ADD COLUMN     "pdfJobId" TEXT;

-- CreateTable
CREATE TABLE "pdf_jobs" (
    "id" TEXT NOT NULL,
    "documentType" "PdfDocumentType" NOT NULL,
    "kind" "ResolutionKind",
    "status" "PdfJobStatus" NOT NULL DEFAULT 'PREPARING',
    "totalDocuments" INTEGER NOT NULL,
    "completedDocuments" INTEGER NOT NULL DEFAULT 0,
    "totalBatches" INTEGER NOT NULL DEFAULT 0,
    "templateBlob" TEXT NOT NULL,
    "templateSha256" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "firstSequence" INTEGER,
    "lastSequence" INTEGER,
    "errorCode" TEXT,
    "errorDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "municipalityId" INTEGER NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "pdf_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_job_batches" (
    "jobId" TEXT NOT NULL,
    "batchIndex" INTEGER NOT NULL,
    "status" "PdfBatchStatus" NOT NULL DEFAULT 'PENDING',
    "documentCount" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_job_batches_pkey" PRIMARY KEY ("jobId","batchIndex")
);

-- CreateIndex
CREATE INDEX "pdf_jobs_municipalityId_createdAt_idx" ON "pdf_jobs"("municipalityId", "createdAt");

-- CreateIndex
CREATE INDEX "pdf_jobs_status_idx" ON "pdf_jobs"("status");

-- CreateIndex
CREATE INDEX "resolutions_pdfJobId_idx" ON "resolutions"("pdfJobId");

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_pdfJobId_fkey" FOREIGN KEY ("pdfJobId") REFERENCES "pdf_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_jobs" ADD CONSTRAINT "pdf_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_job_batches" ADD CONSTRAINT "pdf_job_batches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "pdf_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one active (PREPARING, RUNNING or ASSEMBLING) bulk job per
-- municipality. Prisma's schema can't express a partial unique index; a
-- second POST /pdf-jobs hits this and answers 409.
CREATE UNIQUE INDEX "pdf_jobs_one_active_per_municipality" ON "pdf_jobs"("municipalityId")
  WHERE "status" IN ('PREPARING', 'RUNNING', 'ASSEMBLING');
