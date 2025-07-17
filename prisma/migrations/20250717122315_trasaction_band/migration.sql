-- CreateTable
CREATE TABLE "TransactionCostBand" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "minAmount" DOUBLE PRECISION NOT NULL,
    "maxAmount" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TransactionCostBand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionCostBand_tenantId_idx" ON "TransactionCostBand"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionCostBand_tenantId_minAmount_maxAmount_key" ON "TransactionCostBand"("tenantId", "minAmount", "maxAmount");

-- AddForeignKey
ALTER TABLE "TransactionCostBand" ADD CONSTRAINT "TransactionCostBand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
