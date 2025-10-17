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
        const loanee = await prisma.user.findFirst({
          where: {
            phoneNumber: normalizedBillRefNumber,
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

        console.log(`this is the loneee ${JSON.stringify(loanee)}`);

        if (!loanee) {
          logger.warn(`No user found for phone number ${normalizedBillRefNumber} in transaction ${TransID}`);
          continue;
        }

        // Ensure organizationId is valid
        if (!loanee.organizationId || loanee.organizationId === 0) {
          logger.warn(`Invalid organizationId (${loanee.organizationId}) for user ${normalizedBillRefNumber} in transaction ${TransID}`);
          continue;
        }

        // Verify organization exists
        const organization = await prisma.organization.findUnique({
          where: { id: loanee.organizationId },
        });
        if (!organization) {
          logger.warn(`No organization found for ID ${loanee.organizationId} for user ${normalizedBillRefNumber} in transaction ${TransID}`);
          continue;
        }

        // Fetch disbursed loan payouts
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
          logger.warn(`No outstanding loan payouts found for user ${normalizedBillRefNumber} in transaction ${TransID}`);
          continue;
        }

        organizationId = loanee.organizationId;
        repaymentDescription = `Automated repayment for user ${loanee.firstName} ${loanee.lastName} (${normalizedBillRefNumber}) via M-Pesa transaction ${TransID}`;
        smsRecipient = {
          phoneNumber: loanee.phoneNumber,
          name: `${loanee.firstName} ${loanee.lastName}`,
        };
      } else {
        // Case 2: Organization repayment
        const orgId = parseInt(BillRefNumber);
        if (isNaN(orgId) || orgId === 0) {
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

        // Check for an admin
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

        // Fetch employees
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

        // Fetch disbursed loan payouts
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
      }

      // Step 5: Process repayment within a transaction
   

      // Inside the prisma.$transaction block
await prisma.$transaction(async (tx) => {
  // Create PaymentBatch
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

  // Process each loan payout
  for (const payout of loanPayouts) {
    if (remainingAmount <= 0) break;

    const outstanding = payout.loan.totalRepayable - (payout.loan.repaidAmount || 0);
    if (outstanding <= 0) {
      logger.info(`LoanPayout ${payout.id} already fully repaid in transaction ${TransID}`);
      continue;
    }

    // Calculate amount to apply to this payout
    const payAmount = Math.min(outstanding, remainingAmount);
    if (payAmount <= 0) continue;

    // Check for existing PaymentConfirmation
    const existingConfirmation = await tx.paymentConfirmation.findUnique({
      where: { loanPayoutId: payout.id },
    });

    let repayment;
    if (existingConfirmation) {
      // Update existing PaymentConfirmation
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
      // Create new PaymentConfirmation
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

    // Update LoanPayout
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

    // Update Loan
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
        userId: -1, // System action
        action: 'UPDATE',
        resource: 'ORGANIZATION_CREDIT',
        details: {
          message: `Added ${remainingAmount} to organization ${organizationId} credit balance from M-Pesa transaction ${TransID}`,
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
      userId: -1, // System action
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
        repayments: repayments.map((r) => ({
          loanPayoutId: r.loanPayoutId,
          amountSettled: r.amountSettled,
        })),
      },
    },
  });

  // Send SMS notification
// Inside the prisma.$transaction block
await prisma.$transaction(async (tx) => {
  // Create PaymentBatch
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

  // Process each loan payout
  for (const payout of loanPayouts) {
    if (remainingAmount <= 0) break;

    const outstanding = payout.loan.totalRepayable - (payout.loan.repaidAmount || 0);
    if (outstanding <= 0) {
      logger.info(`LoanPayout ${payout.id} already fully repaid in transaction ${TransID}`);
      continue;
    }

    // Calculate amount to apply to this payout
    const payAmount = Math.min(outstanding, remainingAmount);
    if (payAmount <= 0) continue;

    // Check for existing PaymentConfirmation
    const existingConfirmation = await tx.paymentConfirmation.findUnique({
      where: { loanPayoutId: payout.id },
    });

    let repayment;
    if (existingConfirmation) {
      // Update existing PaymentConfirmation
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
      // Create new PaymentConfirmation
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

    // Update LoanPayout
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

    // Update Loan
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
        userId: -1, // System action
        action: 'UPDATE',
        resource: 'ORGANIZATION_CREDIT',
        details: {
          message: `Added ${remainingAmount} to organization ${organizationId} credit balance from M-Pesa transaction ${TransID}`,
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
      userId: -1, // System action
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
        repayments: repayments.map((r) => ({
          loanPayoutId: r.loanPayoutId,
          amountSettled: r.amountSettled,
        })),
      },
    },
  });

  // Send SMS notification
  if (smsRecipient) {
    const smsPhone = normalizePhoneNumber(smsRecipient.phoneNumber).startsWith('0')
      ? '254' + normalizePhoneNumber(smsRecipient.phoneNumber).slice(1)
      : smsRecipient.phoneNumber;
    const smsMessage = isPhoneNumberFormat(normalizedBillRefNumber)
      ? `Dear ${smsRecipient.name}, your loan repayment of KES ${totalRepaid} has been processed successfully. Transaction ID: ${TransID}.`
      : `Dear ${smsRecipient.name}, ${loanPayouts.length} loan(s) for organization ${organizationId} have been repaid with KES ${totalRepaid}. Transaction ID: ${TransID}.`;

    try {
      await sendSMS(tenantId, smsPhone, smsMessage);
      logger.info(`SMS sent to ${smsPhone}: ${smsMessage}`);
    } catch (smsError) {
      logger.error(`Failed to send SMS to ${smsPhone}:`, smsError);
    }
  }

  // Mark the transaction as processed
  await tx.mPESAC2BTransactions.update({
    where: { id: transaction.id },
    data: { processed: true },
  });
});
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

// Schedule the function to run every minute
// cron.schedule('* * * * *', async () => {
//   logger.info('Running scheduled M-Pesa repayment processing...');
//   await processMpesaRepayments();
// });

// Export the function
export default processMpesaRepayments;