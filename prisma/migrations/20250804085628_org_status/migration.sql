-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('DAILY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "loanType" "LoanType" NOT NULL DEFAULT 'MONTHLY';
