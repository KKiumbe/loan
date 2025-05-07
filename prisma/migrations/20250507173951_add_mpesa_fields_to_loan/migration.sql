/*
  Warnings:

  - You are about to drop the column `approvedAt` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `approvedBy` on the `Loan` table. All the data in the column will be lost.
  - You are about to drop the column `disbursedAt` on the `Loan` table. All the data in the column will be lost.
  - The `status` column on the `Loan` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `bagsHeld` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `customPermissions` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `originalBagsIssued` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `_ConsolidatedRepaymentToLoan` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `dueDate` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `interestRate` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalRepayable` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REPAID');

-- DropForeignKey
ALTER TABLE "_ConsolidatedRepaymentToLoan" DROP CONSTRAINT "_ConsolidatedRepaymentToLoan_A_fkey";

-- DropForeignKey
ALTER TABLE "_ConsolidatedRepaymentToLoan" DROP CONSTRAINT "_ConsolidatedRepaymentToLoan_B_fkey";

-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "approvedAt",
DROP COLUMN "approvedBy",
DROP COLUMN "disbursedAt",
ADD COLUMN     "approvalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consolidatedRepaymentId" INTEGER,
ADD COLUMN     "dueDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "firstApproverId" INTEGER,
ADD COLUMN     "interestRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "mpesaStatus" TEXT,
ADD COLUMN     "mpesaTransactionId" TEXT,
ADD COLUMN     "secondApproverId" INTEGER,
ADD COLUMN     "thirdApproverId" INTEGER,
ADD COLUMN     "totalRepayable" DOUBLE PRECISION NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "LoanStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "bagsHeld",
DROP COLUMN "customPermissions",
DROP COLUMN "originalBagsIssued";

-- DropTable
DROP TABLE "_ConsolidatedRepaymentToLoan";

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_consolidatedRepaymentId_fkey" FOREIGN KEY ("consolidatedRepaymentId") REFERENCES "ConsolidatedRepayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
