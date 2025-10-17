-- AlterEnum
ALTER TYPE "LoanStatus" ADD VALUE 'PPAID';

-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'PPAID';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "repaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LoanPayout" ADD COLUMN     "amountRepaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
