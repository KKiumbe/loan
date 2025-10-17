import { PrismaClient, LoanStatus, PayoutStatus } from '@prisma/client';
import cron from 'node-cron';
import { sendSMS } from '../sms/sms';

// Logger
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

// Utility to normalize phone numbers
const normalizePhoneNumber = (phone: string): string => {
  let normalized = phone.replace(/\s/g, '');
  if (normalized.startsWith('+254')) {
    normalized = '0' + normalized.slice(4);
  } else if (normalized.startsWith('254')) {
    normalized = '0' + normalized.slice(3);
  } else if (normalized.startsWith('7') || normalized.startsWith('1')) {
    normalized = '0' + normalized;
  }
  return normalized; // e.g., 0722230603
};

// Utility to check if a string is in phone number format
const isPhoneNumberFormat = (value: string): boolean => {
  const normalized = normalizePhoneNumber(value);
  const phoneRegex = /^0[17]\d{8}$/;
  return phoneRegex.test(normalized);
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

      // Normalize BillRefNumber
      const normalizedBillRefNumber = normalizePhoneNumber(BillRefNumber);
      logger.info(`Processing transaction ${TransID} with BillRefNumber: ${BillRefNumber}, Normalized: ${normalizedBillRefNumber}`);

      // Step 3: Determine repayment type based on BillRefNumber
      let loanPayouts: any[] = [];
      let organizationId: number | null = null;
      let repaymentDescription = '';
      let smsRecipient: { phoneNumber: string; name: string } | null = null;

      if (isPhoneNumberFormat(normalizedBillRefNumber)) {
        // Case 1: Individual repayment
        logger.info(`Attempting user lookup for phone: ${normalizedBillRefNumber}, tenantId: ${tenantId}`);
        const loanee = await prisma.user.findFirst({
          where: {
            phoneNumber: normalizedBillRefNumber, // Only check normalized format (07xxxxxxxx or 01xxxxxxxx)
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

        logger.info(`User found: ${JSON.stringify(loanee)}`);

        if (!loanee) {
          logger.warn(`No user found for phone number ${normalizedBillRefNumber} in tenant ${tenantId} for transaction ${TransID}`);
          continue;
        }

        // Enforce valid organizationId
        if (!loanee.organizationId || loanee.organizationId === 0) {
          logger.warn(`User ${normalizedBillRefNumber} has invalid organizationId (${loanee.organizationId}) in transaction ${TransID}`);
          continue;
        }

        const organization = await prisma.organization.findUnique({
          where: { id: loanee.organizationId },
        });
        if (!organization) {
          logger.warn(`No organization found for ID ${loanee.organizationId} for user ${normalizedBillRefNumber} in transaction ${TransID}`);
          continue;
        }

        organizationId = loanee.organizationId;
        loanPayouts = await prisma.loanPayout.findMany({
          where: {
            tenantId,
            status: { in: ['DISBURSED', 'PPAID'] },
            loan: {
              userId: loanee.id,
              status: { in: ['DISBURSED', 'PPAID'] },
            },
          },
          select: {
            id: true,
            loanId: true,
            amount: true,
            amountRepaid: true,
            status: true,
            loan: {
              select: {
                id: true,
                organizationId: true,
                totalRepayable: true,
                repaidAmount: true,
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
          logger.warn(`No outstanding loan payouts found for user ${normalizedBillRefNumber} in transaction ${TransID}`);
          continue;
        }

        repaymentDescription = `Automated repayment for user ${loanee.firstName} ${loanee.lastName} (${normalizedBillRefNumber}) via M-Pesa transaction ${TransID}`;
        smsRecipient = {
          phoneNumber: loanee.phoneNumber,
          name: `${loanee.firstName} ${loanee.lastName}`,
        };
      } else {
        // Case 2: Organization repayment
        const orgId = parseInt(BillRefNumber);
        if (isNaN(orgId) || orgId <= 0 || orgId > 9999999) {
          logger.warn(`Invalid organizationId ${BillRefNumber} (parsed: ${orgId}) for transaction ${TransID}. Must be a positive integer with 7 or fewer digits.`);
          if (BillRefNumber.match(/^\d+$/) && BillRefNumber.length >= 10) {
            logger.warn(`BillRefNumber ${BillRefNumber} resembles an invalid phone number. Consider manual review.`);
          }
          continue;
        }

        const organization = await prisma.organization.findFirst({
          where: { id: orgId, tenantId },
        });
        if (!organization) {
          logger.warn(`No organization found for ID ${orgId} in tenant ${tenantId} for transaction ${TransID}`);
          continue;
        }

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

        loanPayouts = await prisma.loanPayout.findMany({
          where: {
            tenantId,
            status: { in: ['DISBURSED', 'PPAID'] },
            loan: {
              organizationId: orgId,
              userId: { in: employees.map((emp) => emp.user?.id).filter((id): id is number => id !== null) },
              status: { in: ['DISBURSED', 'PPAID'] },
            },
          },
          select: {
            id: true,
            loanId: true,
            amount: true,
            amountRepaid: true,
            status: true,
            loan: {
              select: {
                id: true,
                organizationId: true,
                totalRepayable: true,
                repaidAmount: true,
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
      const totalRepayable = loanPayouts.reduce((sum, payout) => sum + (payout.loan.totalRepayable - (payout.loan.repaidAmount || 0)), 0);
      let totalRepaid = 0;

      if (TransAmount < totalRepayable) {
        logger.warn(`Transaction amount ${TransAmount} is less than total repayable ${totalRepayable} for ${loanPayouts.length} loans in transaction ${TransID}`);
      }

      // Step 5: Process repayment within a transaction
      const { repayments, paymentBatchId } = await prisma.$transaction(
        async (tx) => {
          const paymentBatch = await tx.paymentBatch.create({
            data: {
              tenant: { connect: { id: tenantId } },
              organization: { connect: { id: organizationId! } },
              totalAmount: TransAmount,
              paymentMethod: 'MPESA',
              reference: TransID,
              remarks: repaymentDescription,
            },
          });

          let remainingAmount = TransAmount;
          const repayments: LoanPayment[] = [];
          const processedPayoutIds: Set<number> = new Set(); // Track processed LoanPayout IDs

          for (const payout of loanPayouts) {
            if (remainingAmount <= 0) break;
            if (processedPayoutIds.has(payout.id)) {
              logger.warn(`LoanPayout ${payout.id} already processed in transaction ${TransID}`);
              continue;
            }

            const outstanding = payout.loan.totalRepayable - (payout.loan.repaidAmount || 0);
            if (outstanding <= 0) {
              logger.info(`LoanPayout ${payout.id} already fully repaid in transaction ${TransID}`);
              continue;
            }

            const payAmount = Math.min(outstanding, remainingAmount);
            if (payAmount <= 0) continue;

            const existingConfirmation = await tx.paymentConfirmation.findUnique({
              where: { loanPayoutId: payout.id },
            });

            let repayment;
            if (existingConfirmation) {
              logger.info(`Updating PaymentConfirmation for LoanPayout ${payout.id} with additional amount ${payAmount}`);
              repayment = await tx.paymentConfirmation.update({
                where: { id: existingConfirmation.id },
                data: {
                  amountSettled: { increment: payAmount },
                  settledAt: new Date(),
                  paymentBatchId: paymentBatch.id,
                },
                select: {
                  id: true,
                  amountSettled: true,
                  settledAt: true,
                  paymentBatchId: true,
                  loanPayoutId: true,
                },
              });
            } else {
              logger.info(`Creating PaymentConfirmation for LoanPayout ${payout.id} with amount ${payAmount}`);
              repayment = await tx.paymentConfirmation.create({
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
            }

            repayments.push({
              id: repayment.id.toString(),
              paymentBatchId: repayment.paymentBatchId.toString(),
              loanPayoutId: repayment.loanPayoutId.toString(),
              amountSettled: repayment.amountSettled,
              settledAt: repayment.settledAt,
            });

            processedPayoutIds.add(payout.id); // Mark as processed

            const newPayoutAmountRepaid = (payout.amountRepaid || 0) + payAmount;
            const payoutStatus = newPayoutAmountRepaid >= payout.loan.totalRepayable ? 'REPAID' : 'PPAID';
            await tx.loanPayout.update({
              where: { id: payout.id },
              data: {
                amountRepaid: newPayoutAmountRepaid,
                status: payoutStatus,
                updatedAt: new Date(),
              },
            });

            const newLoanRepaidAmount = (payout.loan.repaidAmount || 0) + payAmount;
            const loanStatus = newLoanRepaidAmount >= payout.loan.totalRepayable ? 'REPAID' : 'PPAID';
            await tx.loan.update({
              where: { id: payout.loanId },
              data: {
                repaidAmount: newLoanRepaidAmount,
                status: loanStatus,
                updatedAt: new Date(),
              },
            });

            totalRepaid += payAmount;
            remainingAmount -= payAmount;
          }

          if (remainingAmount > 0) {
            await tx.organization.update({
              where: { id: organizationId!, tenantId },
              data: {
                creditBalance: { increment: remainingAmount },
              },
            });

            // await tx.auditLog.create({
            //   data: {
            //     tenantId,
            //     userId: -1,
            //     action: 'UPDATE',
            //     resource: 'ORGANIZATION_CREDIT',
            //     details: {
            //       message: `Added ${remainingAmount} to organization ${organizationId} credit balance from M-Pesa transaction ${TransID}`,
            //       organizationId,
            //       amount: remainingAmount,
            //       paymentMethod: 'MPESA',
            //       reference: TransID,
            //     },
            //   },
            // });
          }

          // await tx.auditLog.create({
          //   data: {
          //     tenantId,
          //     userId: -1,
          //     action: 'CREATE',
          //     resource: 'REPAYMENT',
          //     details: {
          //       message: repaymentDescription,
          //       loanPayoutIds: Array.from(processedPayoutIds),
          //       loanIds: loanPayouts.map(p => p.loanId),
          //       amount: TransAmount,
          //       remainingAmount,
          //       paymentMethod: 'MPESA',
          //       reference: TransID,
          //       repayments: repayments.map(r => ({
          //         loanPayoutId: r.loanPayoutId,
          //         amountSettled: r.amountSettled,
          //       })),
          //     },
          //   },
          // });

          await tx.mPESAC2BTransactions.update({
            where: { id: transaction.id },
            data: { processed: true },
          });

          return { repayments, paymentBatchId: paymentBatch.id };
        },
        { timeout: 10000 } // Increase timeout to 10 seconds
      );

      // Step 6: Send SMS notification outside the transaction
      if (smsRecipient) {
        const smsPhone = normalizePhoneNumber(smsRecipient.phoneNumber).startsWith('0')
          ? '254' + normalizePhoneNumber(smsRecipient.phoneNumber).slice(1)
          : smsRecipient.phoneNumber;

        const totalRemaining = loanPayouts.reduce((sum, payout) => {
          const repayment = repayments.find(r => r.loanPayoutId === payout.id.toString());
          const remaining = payout.loan.totalRepayable - ((payout.loan.repaidAmount || 0) + (repayment?.amountSettled || 0));
          return sum + Math.max(remaining, 0);
        }, 0);

        const smsMessage = isPhoneNumberFormat(normalizedBillRefNumber)
          ? `Dear ${smsRecipient.name}, your loan repayment of KES ${totalRepaid.toFixed(2)} has been processed. Remaining balance: KES ${totalRemaining.toFixed(2)}. Trans ID: ${TransID}.`
          : `Dear ${smsRecipient.name}, ${loanPayouts.length} loan(s) repaid with KES ${totalRepaid.toFixed(2)}. Total remaining: KES ${totalRemaining.toFixed(2)}. Trans ID: ${TransID}.`;

        try {
          logger.info(`Sending SMS to ${smsPhone}`);
          await sendSMS(tenantId, smsPhone, smsMessage);
          // await prisma.auditLog.create({
          //   data: {
          //     tenantId,
          //     userId: -1,
          //     action: 'SEND_SMS',
          //     resource: 'NOTIFICATION',
          //     details: {
          //       recipient: smsPhone,
          //       message: smsMessage,
          //       transactionId: TransID,
          //     },
          //   },
          // });
          logger.info(`SMS sent to ${smsPhone}: ${smsMessage}`);
        } catch (smsError) {
          logger.error(`Failed to send SMS to ${smsPhone}:`, smsError);
        }
      }

      logger.info(`Processed M-Pesa transaction ${TransID}: ${repaymentDescription}`);
    }
  } catch (error: any) {
    logger.error('Error processing M-Pesa repayments:', error);
  } finally {
    console.timeEnd('processMpesaRepayments');
    await prisma.$disconnect();
  }
};

// Schedule the function to run every 5 minutes
// cron.schedule('*/5 * * * *', async () => {
//   logger.info('Running scheduled M-Pesa repayment processing...');
//   await processMpesaRepayments();
// });

// Export the function
export default processMpesaRepayments;