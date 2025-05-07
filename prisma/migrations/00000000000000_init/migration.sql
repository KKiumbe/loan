-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'REPAID', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RepaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Lender" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "approvalSteps" INTEGER NOT NULL DEFAULT 1,
    "loanLimitMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "idNumber" TEXT,
    "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "creditScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disbursedAt" TIMESTAMP(3),
    "repaymentDueAt" TIMESTAMP(3),
    "consolidatedRepaymentId" INTEGER,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidatedRepayment" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" "RepaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "ConsolidatedRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpesaConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "consumerSecret" TEXT NOT NULL,
    "passkey" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpesaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpesaTransaction" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SMSConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "customerSupportPhoneNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SMSConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lender_tenantId_key" ON "Lender"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Lender_contactEmail_key" ON "Lender"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Lender_contactPhone_key" ON "Lender"("contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "Customer"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_idNumber_key" ON "Customer"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaConfig_tenantId_key" ON "MpesaConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_loanId_key" ON "MpesaTransaction"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_transactionId_key" ON "MpesaTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SMSConfig_tenantId_key" ON "SMSConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Lender"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Lender"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_consolidatedRepaymentId_fkey" FOREIGN KEY ("consolidatedRepaymentId") REFERENCES "ConsolidatedRepayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedRepayment" ADD CONSTRAINT "ConsolidatedRepayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Lender"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedRepayment" ADD CONSTRAINT "ConsolidatedRepayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaConfig" ADD CONSTRAINT "MpesaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Lender"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SMSConfig" ADD CONSTRAINT "SMSConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Lender"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "todo" CASCADE;

