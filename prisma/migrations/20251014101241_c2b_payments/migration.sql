/*
  Warnings:

  - A unique constraint covering the columns `[b2cShortCode]` on the table `MPESAConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "MPESAC2BTransactions" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "TransID" TEXT NOT NULL,
    "TransTime" TIMESTAMP(3) NOT NULL,
    "ShortCode" TEXT NOT NULL,
    "TransAmount" DOUBLE PRECISION NOT NULL,
    "BillRefNumber" TEXT NOT NULL,
    "MSISDN" TEXT NOT NULL,
    "FirstName" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MPESAC2BTransactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MPESAC2BTransactions_TransID_key" ON "MPESAC2BTransactions"("TransID");

-- CreateIndex
CREATE UNIQUE INDEX "MPESAConfig_b2cShortCode_key" ON "MPESAConfig"("b2cShortCode");

-- AddForeignKey
ALTER TABLE "MPESAC2BTransactions" ADD CONSTRAINT "MPESAC2BTransactions_ShortCode_fkey" FOREIGN KEY ("ShortCode") REFERENCES "MPESAConfig"("b2cShortCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MPESAC2BTransactions" ADD CONSTRAINT "MPESAC2BTransactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
