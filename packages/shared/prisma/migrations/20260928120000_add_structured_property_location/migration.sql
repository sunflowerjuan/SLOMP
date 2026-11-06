-- AlterTable
ALTER TABLE "properties"
ADD COLUMN     "ruralDistrict" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);