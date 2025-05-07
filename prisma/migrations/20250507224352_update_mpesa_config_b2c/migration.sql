/*
  Warnings:

  - You are about to drop the `MpesaConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE 'DISBURSED';

-- DropForeignKey
ALTER TABLE "MpesaConfig" DROP CONSTRAINT "MpesaConfig_tenantId_fkey";

-- DropTable
DROP TABLE "MpesaConfig";

-- CreateTable
CREATE TABLE "MPESAConfig" (
    "tenantId" INTEGER NOT NULL,
    "b2cShortCode" TEXT NOT NULL,
    "initiatorName" TEXT NOT NULL,
    "securityCredential" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "consumerSecret" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MPESAConfig_tenantId_key" ON "MPESAConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "MPESAConfig" ADD CONSTRAINT "MPESAConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
