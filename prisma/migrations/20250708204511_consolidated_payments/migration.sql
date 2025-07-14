/*
  Warnings:

  - Added the required column `amount` to the `ConsolidatedRepayment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `ConsolidatedRepayment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ConsolidatedRepayment" ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL,
ALTER COLUMN "totalAmount" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ConsolidatedRepayment" ADD CONSTRAINT "ConsolidatedRepayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
