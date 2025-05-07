/*
  Warnings:

  - You are about to drop the column `approvalLevel` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `consolidatedRepaymentId` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `durationDays` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `interestRate` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `repaymentDueAt` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `callbackUrl` on the `MpesaConfig` table. All the data in the column will be lost.
  - You are about to drop the column `passkey` on the `MpesaConfig` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `Tenant` table. All the data in the column will be lost.
  - The `status` column on the `Tenant` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `MpesaTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserActivity` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[employeeId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `status` on the `ConsolidatedRepayment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `Loan` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `passKey` to the `MpesaConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_consolidatedRepaymentId_fkey";

-- DropForeignKey
ALTER TABLE "MpesaTransaction" DROP CONSTRAINT "MpesaTransaction_loanId_fkey";

-- DropForeignKey
ALTER TABLE "UserActivity" DROP CONSTRAINT "UserActivity_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UserActivity" DROP CONSTRAINT "UserActivity_userId_fkey";

-- DropIndex
DROP INDEX "MpesaConfig_tenantId_key";

-- DropIndex
DROP INDEX "Tenant_name_key";

-- AlterTable
ALTER TABLE "ConsolidatedRepayment" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "approvalLevel",
DROP COLUMN "consolidatedRepaymentId",
DROP COLUMN "durationDays",
DROP COLUMN "interestRate",
DROP COLUMN "repaymentDueAt",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" INTEGER,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "MpesaConfig" DROP COLUMN "callbackUrl",
DROP COLUMN "passkey",
ADD COLUMN     "passKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "createdBy",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "allowedUsers" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "alternativePhoneNumber" TEXT,
ADD COLUMN     "building" TEXT,
ADD COLUMN     "county" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "town" TEXT,
ADD COLUMN     "website" TEXT,
ALTER COLUMN "subscriptionPlan" DROP DEFAULT,
ALTER COLUMN "monthlyCharge" DROP DEFAULT,
DROP COLUMN "status",
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bagsHeld" INTEGER,
ADD COLUMN     "createdBy" INTEGER,
ADD COLUMN     "customPermissions" JSONB,
ADD COLUMN     "employeeId" INTEGER,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalBagsIssued" INTEGER,
ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resetCode" TEXT,
ADD COLUMN     "resetCodeExpiresAt" TIMESTAMP(3),
ALTER COLUMN "role" DROP DEFAULT,
DROP COLUMN "status",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropTable
DROP TABLE "MpesaTransaction";

-- DropTable
DROP TABLE "UserActivity";

-- DropEnum
DROP TYPE "LoanStatus";

-- DropEnum
DROP TYPE "RepaymentStatus";

-- DropEnum
DROP TYPE "TransactionStatus";

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "grossSalary" DOUBLE PRECISION NOT NULL,
    "jobId" TEXT,
    "secondaryPhoneNumber" TEXT,
    "tenantId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConsolidatedRepaymentToLoan" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_phoneNumber_key" ON "Employee"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_idNumber_key" ON "Employee"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "_ConsolidatedRepaymentToLoan_AB_unique" ON "_ConsolidatedRepaymentToLoan"("A", "B");

-- CreateIndex
CREATE INDEX "_ConsolidatedRepaymentToLoan_B_index" ON "_ConsolidatedRepaymentToLoan"("B");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConsolidatedRepaymentToLoan" ADD CONSTRAINT "_ConsolidatedRepaymentToLoan_A_fkey" FOREIGN KEY ("A") REFERENCES "ConsolidatedRepayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConsolidatedRepaymentToLoan" ADD CONSTRAINT "_ConsolidatedRepaymentToLoan_B_fkey" FOREIGN KEY ("B") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
