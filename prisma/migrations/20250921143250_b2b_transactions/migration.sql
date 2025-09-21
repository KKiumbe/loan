-- CreateEnum
CREATE TYPE "B2BStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "MPesaBalance" ADD COLUMN     "mmfBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "B2BTransfer" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "partyA" TEXT NOT NULL,
    "partyB" TEXT NOT NULL,
    "commandID" TEXT NOT NULL,
    "remarks" TEXT,
    "occasion" TEXT,
    "conversationID" TEXT,
    "originatorConversationID" TEXT,
    "transactionID" TEXT,
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "status" "B2BStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "B2BTransfer_originatorConversationID_key" ON "B2BTransfer"("originatorConversationID");

-- AddForeignKey
ALTER TABLE "B2BTransfer" ADD CONSTRAINT "B2BTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
