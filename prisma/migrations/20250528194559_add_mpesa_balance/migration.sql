-- CreateTable
CREATE TABLE "MPesaBalance" (
    "id" SERIAL NOT NULL,
    "resultType" INTEGER NOT NULL,
    "resultCode" INTEGER NOT NULL,
    "resultDesc" TEXT NOT NULL,
    "originatorConversationID" TEXT NOT NULL,
    "conversationID" TEXT NOT NULL,
    "transactionID" TEXT NOT NULL,
    "workingAccountBalance" DOUBLE PRECISION,
    "utilityAccountBalance" DOUBLE PRECISION,
    "boCompletedTime" TIMESTAMP(3) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MPesaBalance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MPesaBalance" ADD CONSTRAINT "MPesaBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
