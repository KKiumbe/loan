-- CreateEnum
CREATE TYPE "InterestRateType" AS ENUM ('MONTHLY', 'DAILY');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "baseInterestRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
ADD COLUMN     "dailyInterestRate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
ADD COLUMN     "interestRateType" "InterestRateType" NOT NULL DEFAULT 'MONTHLY';
