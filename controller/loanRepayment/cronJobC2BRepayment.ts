import { PrismaClient, LoanStatus, PayoutStatus } from '@prisma/client';

import { sendSMS } from '../sms/sms';

// Import or define a logger (using console as fallback)
const logger = {
  info: console.info,
  warn: console.warn,
  error: console.error,
};

// Initialize Prisma client
const prisma = new PrismaClient();

// Interface for loan payment
interface LoanPayment {
  id: string;
  paymentBatchId: string;
  loanPayoutId: string;
  amountSettled: number;
  settledAt: Date;
}

// Utility to check if a string is in phone number format
const isPhoneNumberFormat = (value: string): boolean => {
  // Adjust regex based on your phone number format (e.g., +2547XXXXXXXX, 07XXXXXXXX)
  const phoneRegex = /^(\+254|0)?7\d{8}$/;
  return phoneRegex.test(value);
};

// Function to process M-Pesa transactions for repayments
const processMpesaRepayments = async (): Promise<void> => {
  try {
    console.time('processMpesaRepayments');

    // Step 1: Fetch unprocessed M-Pesa transactions
    const unprocessedTransactions = await prisma.mPESAC2BTransactions.findMany({
      where: {
        processed: false,
      },
      include: {
        tenant: true,
        mpesaConfig: true,
      },
    });

    if (unprocessedTransactions.length === 0) {
      logger.info('No unprocessed M-Pesa transactions found.');
      return;
    }

    // Step 2: Process each unprocessed transaction
    for (const transaction of unprocessedTransactions) {
      const { tenantId, TransAmount, BillRefNumber, TransID } = transaction;

      // Step 3: Determine repayment type based on BillRefNumber
      let loanPayouts: any[] = [];
      let organizationId: number | null = null;
      let repaymentDescription = '';
      let smsRecipient: { phoneNumber: string; name: string } | null = null;

      if (isPhoneNumberFormat(BillRefNumber)) {
        // Case 1: Individual repayment (BillRefNumber is a phone number)
        const loanee = await prisma.user.findFirst({
          where: {
            phoneNumber: BillRefNumber,
            tenantId,
          },
          select: {
            id: true,
            organizationId: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        });

        console.log(`this is the loneee ${loanee}`);

        if (!loanee) {
          logger.warn(`No user found for phone number ${BillRefNumber} in transaction ${TransID}`);
          continue;
        }

        // Ensure organizationId is defined
        if (!loanee.organizationId) {
          logger.warn(`No organization associated with user ${BillRefNumber} in transaction ${TransID}`);
          continue;
        }

        // Fetch disbursed loan payouts for the loanee
        loanPayouts = await prisma.loanPayout.findMany({
          where: {
            tenantId,
            status: 'DISBURSED',
            loan: {
              userId: loanee.id,
              status: { in: ['DISBURSED'] },
            },
          },
          select: {
            id: true,
            loanId: true,
            amount: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            loan: {
              select: {
                id: true,
                organizationId: true,
                totalRepayable: true,
                status: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
        });

        if (loanPayouts.length === 0) {
          logger.warn(`No outstanding loan payouts found for user ${BillRefNumber} in transaction ${TransID}`);
          continue;
        }

        organizationId = loanee.organizationId;
        repaymentDescription = `Automated repayment for user ${loanee.firstName} ${loanee.lastName} (${BillRefNumber}) via M-Pesa transaction ${TransID}`;
        smsRecipient = {
          phoneNumber: loanee.phoneNumber,
          name: `${loanee.firstName} ${loanee.lastName}`,
        };
      } else {
        // Case 2: Organization repayment (BillRefNumber is organization ID)
        const orgId = parseInt(BillRefNumber);
        if (isNaN(orgId)) {
          logger.warn(`Invalid organizationId in BillRefNumber ${BillRefNumber} for transaction ${TransID}`);
          continue;
        }

        // Verify organization exists
        const organization = await prisma.organization.findFirst({
          where: { id: orgId, tenantId },
        });
        if (!organization) {
          logger.warn(`No organization found for ID ${orgId} in tenant ${tenantId} for transaction ${TransID}`);
          continue;
        }

        // Check for an admin matching the organization ID
        const orgAdmin = await prisma.user.findFirst({
          where: {
            tenantId,
            organizationId: orgId,
            OR: [
              { role: { has: 'ADMIN' } },
              { role: { has: 'ORG_ADMIN' } },
            ],
          },
          select: {
            id: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
          },
        });

        if (!orgAdmin) {
          logger.warn(`No admin found for organization ${orgId} in transaction ${TransID}`);
          continue;
        }

        // Fetch employees in the organization
        const employees = await prisma.employee.findMany({
          where: {
            tenantId,
            organizationId: orgId,
          },
          select: {
            id: true,
            user: { select: { id: true } },
          },
        });

        if (employees.length === 0) {
          logger.warn(`No employees found for organization ${orgId} in transaction ${TransID}`);
          continue;
        }

        // Fetch disbursed loan payouts for employees
        loanPayouts = await prisma.loanPayout.findMany({
          where: {
            tenantId,
            status: 'DISBURSED',
            loan: {
              organizationId: orgId,
              userId: { in: employees.map((emp) => emp.user?.id).filter((id): id is number => id !== null) },
              status: { in: ['DISBURSED'] },
            },
          },
          select: {
            id: true,
            loanId: true,
            amount: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            loan: {
              select: {
                id: true,
                organizationId: true,
                totalRepayable: true,
                status: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
        });

        if (loanPayouts.length === 0) {
          logger.warn(`No outstanding loan payouts found for organization ${orgId} in transaction ${TransID}`);
          continue;
        }

        organizationId = orgId;
        repaymentDescription = `Automated repayment for ${loanPayouts.length} employee loans in organization ${orgId} via M-Pesa transaction ${TransID}`;
        smsRecipient = {
          phoneNumber: orgAdmin.phoneNumber,
          name: `${orgAdmin.firstName} ${orgAdmin.lastName}`,
        };
      }

      // Step 4: Calculate total repayable amount
      const totalRepayable = loanPayouts.reduce((sum, payout) => sum + payout.loan.totalRepayable, 0);
      let totalRepaid = 0;

      if (TransAmount < totalRepayable) {
        logger.warn(
          `Transaction amount ${TransAmount} is less than total repayable ${totalRepayable} for ${loanPayouts.length} loans in transaction ${TransID}`
        );
        // Proceed to repay as much as possible
      }

      // Step 5: Process repayment within a transaction
      await prisma.$transaction(async (tx) => {
        // Create PaymentBatch with tenant and organization relations
        const paymentBatch = await tx.paymentBatch.create({
          data: {
            tenant: { connect: { id: tenantId } },
            organization: { connect: { id: organizationId! } }, // organizationId is guaranteed non-null
            totalAmount: TransAmount,
            paymentMethod: 'MPESA',
            reference: TransID,
            remarks: repaymentDescription,
          },
        });

        let remainingAmount = TransAmount;
        const repayments: LoanPayment[] = [];

        // Process each loan payout
        for (const payout of loanPayouts) {
          if (remainingAmount <= 0) break;

          const outstanding = payout.loan.totalRepayable;
          const payAmount = Math.min(outstanding, remainingAmount);

          // Create PaymentConfirmation
          const repayment = await tx.paymentConfirmation.create({
            select: {
              id: true,
              amountSettled: true,
              settledAt: true,
              paymentBatchId: true,
              loanPayoutId: true,
            },
            data: {
              paymentBatchId: paymentBatch.id,
              loanPayoutId: payout.id,
              amountSettled: payAmount,
            },
          });

          repayments.push({
            id: repayment.id.toString(),
            paymentBatchId: repayment.paymentBatchId.toString(),
            loanPayoutId: repayment.loanPayoutId.toString(),
            amountSettled: repayment.amountSettled,
            settledAt: repayment.settledAt,
          });

          totalRepaid += payAmount;

          // Update LoanPayout and Loan if fully settled
          if (payAmount >= outstanding) {
            await tx.loan.update({
              where: { id: payout.loanId },
              data: { status: 'REPAID' },
            });

            await tx.loanPayout.update({
              where: { id: payout.id },
              data: { status: 'REPAID' },
            });
          }

          remainingAmount -= payAmount;
        }

        // Save remaining amount to organization credit balance
        if (remainingAmount > 0) {
          await tx.organization.update({
            where: { id: organizationId!, tenantId },
            data: {
              creditBalance: { increment: remainingAmount },
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              userId: -1, // Fallback userId
              action: 'UPDATE',
              resource: 'ORGANIZATION_CREDIT',
              details: {
                message: `Automated: Added ${remainingAmount} to organization ${organizationId} credit balance from M-Pesa transaction ${TransID}`,
                organizationId,
                amount: remainingAmount,
                paymentMethod: 'MPESA',
                reference: TransID,
              },
            },
          });
        }

        // Log the repayment action
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: -1, // Fallback userId
            action: 'CREATE',
            resource: 'REPAYMENT',
            details: {
              message: repaymentDescription,
              loanPayoutIds: loanPayouts.map((p) => p.id),
              loanIds: loanPayouts.map((p) => p.loanId),
              amount: TransAmount,
              remainingAmount,
              paymentMethod: 'MPESA',
              reference: TransID,
            },
          },
        });

        // Send SMS notification
        if (smsRecipient) {
          const smsMessage = isPhoneNumberFormat(BillRefNumber)
            ? `Dear ${smsRecipient.name}, your loan repayment of KES ${totalRepaid} has been processed successfully. Transaction ID: ${TransID}.`
            : `Dear ${smsRecipient.name}, ${loanPayouts.length} loan(s) for organization ${organizationId} have been repaid with KES ${totalRepaid}. Transaction ID: ${TransID}.`;

          try {
            await sendSMS(tenantId, smsRecipient.phoneNumber, smsMessage);
            logger.info(`SMS sent to ${smsRecipient.phoneNumber}: ${smsMessage}`);
          } catch (smsError) {
            logger.error(`Failed to send SMS to ${smsRecipient.phoneNumber}:`, smsError);
          }
        }

        // Mark the transaction as processed
        await tx.mPESAC2BTransactions.update({
          where: { id: transaction.id },
          data: { processed: true },
        });
      });

      logger.info(`Processed M-Pesa transaction ${TransID}: ${repaymentDescription}`);
    }
  } catch (error: any) {
    logger.error('Error processing M-Pesa repayments:', error);
  } finally {
    console.timeEnd('processMpesaRepayments');
    await prisma.$disconnect();
  }
};

// Schedule the function to run every minute (for any unprocessed transactions)
// cron.schedule('* * * * *', async () => {
//   logger.info('Running scheduled M-Pesa repayment processing...');
//   await processMpesaRepayments();
// });

// Export the function for manual triggering or testing
export default processMpesaRepayments;