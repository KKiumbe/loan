/*
  Warnings:

  - You are about to drop the column `transactionFee` on the `Loan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "transactionFee";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
