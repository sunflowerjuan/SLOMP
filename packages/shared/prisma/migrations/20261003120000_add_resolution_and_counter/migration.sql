CREATE TYPE "ResolutionKind" AS ENUM ('PRESCRIPTION_RISK', 'NORMAL');

CREATE TABLE "resolutions" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "ResolutionKind" NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'VIGENTE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyId" INTEGER NOT NULL,

    CONSTRAINT "resolutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resolution_counters" (
    "year" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resolution_counters_pkey" PRIMARY KEY ("year")
);

ALTER TABLE "settlements" ADD COLUMN "resolutionId" INTEGER;

CREATE UNIQUE INDEX "resolutions_number_key" ON "resolutions"("number");
CREATE UNIQUE INDEX "resolutions_year_sequence_key" ON "resolutions"("year", "sequence");
CREATE INDEX "resolutions_propertyId_idx" ON "resolutions"("propertyId");
CREATE INDEX "settlements_resolutionId_idx" ON "settlements"("resolutionId");

ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_resolutionId_fkey"
    FOREIGN KEY ("resolutionId") REFERENCES "resolutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
