import { Request, Response } from 'express';
import {  LoanStatus, PrismaClient } from '@prisma/client';

import { AuthenticatedRequest } from '../../middleware/verifyToken';

import { ErrorResponse, LoanRepayment,  } from '../../types/loans/loan';
import { sendSMS } from '../sms/sms';




// Initialize Prisma client
const prisma = new PrismaClient();




export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error?: string | null;
}



// Interface for the request body
interface RepaymentRequestBody {
  amount: number;
  organizationId: number;
}

 interface loanPayment {
  id: string;
  paymentBatchId: string;
  loanPayoutId: string;
  amountSettled: number;
  settledAt: Date;
  
}




const createRepayment = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<loanPayment[] | ErrorResponse>>
): Promise<void> => {
  const { organizationId, totalAmount, method, reference, remarks } = req.body;
  const { id, tenantId, role, firstName, lastName, organizationId: userOrganizationId } = req.user!;

  // Validate user and required fields
  if (id === null || tenantId === null || role === null || firstName === null || lastName === null) {
    res.status(401).json({
      success: false,
      data: null,
      message: `Unauthorized: User not authenticated or missing required fields`,
    });
    return;
  }

  // Restrict to ORG_ADMIN or ADMIN roles
  if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
    res.status(403).json({
      message: 'Only ORG_ADMIN or ADMIN can initiate repayments',
      success: false,
      data: null,
    });
    return;
  }

  // Validate request body
  if (!totalAmount || totalAmount <= 0 || !organizationId || !method) {
    res.status(400).json({
      message: 'Valid totalAmount, organizationId, and method are required',
      success: false,
      data: null,
    });
    return;
  }

  try {
    // For ORG_ADMIN, verify they belong to the organization
    if (role.includes('ORG_ADMIN')) {
      if (!userOrganizationId) {
        res.status(403).json({
          message: 'ORG_ADMIN must have an organizationId',
          success: false,
          data: null,
        });
        return;
      }
      console.time('employeeQuery');
      const employee = await prisma.employee.findFirst({
        where: { id: userOrganizationId, tenantId },
        select: { organizationId: true },
      });
      console.timeEnd('employeeQuery');

      if (!employee || employee.organizationId !== organizationId) {
        res.status(403).json({
          message: 'Unauthorized to initiate repayment for this organization',
          success: false,
          data: null,
        });
        return;
      }
    } else if (role.includes('ADMIN')) {
      const org = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org || org.tenantId !== tenantId) {
        res.status(403).json({
          message: 'Unauthorized to initiate repayment for this organization',
          success: false,
          data: null,
        });
        return;
      }
    }

    // Fetch all non-repaid loan payouts for the organization
    console.time('loanPayoutsQuery');
    const loanPayouts = await prisma.loanPayout.findMany({
      where: {
        tenantId,
        status: { in: ['DISBURSED', 'PPAID'] },
        loan: {
          organizationId,
          status: { in: ['DISBURSED', 'PPAID'] }, // Include partially paid loans
        },
      },
      select: {
        id: true,
        loanId: true,
        amount: true,
        amountRepaid: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    console.timeEnd('loanPayoutsQuery');

    if (loanPayouts.length === 0) {
      res.status(400).json({
        message: 'No outstanding loan payouts found for this organization',
        success: false,
        data: null,
      });
      return;
    }

    // Calculate total repayable amount
    const totalRepayable = loanPayouts.reduce(
      (sum, payout) => sum + (payout.loan.totalRepayable - (payout.loan.repaidAmount || 0)),
      0
    );
    // if (totalAmount < totalRepayable) {
    //   res.status(400).json({
    //     message: `Repayment amount (${totalAmount}) is less than total repayable (${totalRepayable}) for ${loanPayouts.length} loan payouts`,
    //     success: false,
    //     data: null,
    //   });
    //   return;
    // }

    // Use a transaction to ensure atomicity
    const repayments: loanPayment[] = await prisma.$transaction(async (tx) => {
      // Create PaymentBatch
      const paymentBatch = await tx.paymentBatch.create({
        data: {
          tenantId,
          organizationId,
          totalAmount,
          paymentMethod: method,
          reference: reference || `BATCH-${Date.now()}`,
          remarks: remarks || undefined,
        },
      });

      let remainingAmount = totalAmount;
      const repayments: loanPayment[] = [];

      for (const payout of loanPayouts) {
        if (remainingAmount <= 0) break;

        const outstanding = payout.loan.totalRepayable - (payout.loan.repaidAmount || 0);
        if (outstanding <= 0) continue;

        const payAmount = Math.min(outstanding, remainingAmount);

        // Check for existing PaymentConfirmation
        const existingConfirmation = await tx.paymentConfirmation.findUnique({
          where: { loanPayoutId: payout.id },
        });

        let repayment;
        if (existingConfirmation) {
          // Update existing PaymentConfirmation
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

        remainingAmount -= payAmount;
      }

      // Save remaining amount to organization credit balance
      if (remainingAmount > 0) {
        console.time('updateCreditBalance');
        await tx.organization.update({
          where: { id: organizationId, tenantId },
          data: {
            creditBalance: { increment: remainingAmount },
          },
        });
        console.timeEnd('updateCreditBalance');

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: id,
            action: 'UPDATE',
            resource: 'ORGANIZATION_CREDIT',
            details: {
              message: `User ${firstName} ${lastName} added ${remainingAmount} to organization ${organizationId} credit balance`,
              organizationId,
              amount: remainingAmount,
              paymentMethod: method,
              reference: reference || `BATCH-${Date.now()}`,
            },
          },
        });
      }

      // Send SMS notifications to affected users
      const totalRepaid = totalAmount - remainingAmount;
      for (const payout of loanPayouts) {
        const repayment = repayments.find(r => r.loanPayoutId === payout.id.toString());
        if (!repayment) continue;

        const remainingLoanAmount = payout.loan.totalRepayable - ((payout.loan.repaidAmount || 0) + repayment.amountSettled);
        const smsPhone = payout.loan.user.phoneNumber.startsWith('0')
          ? '254' + payout.loan.user.phoneNumber.slice(1)
          : payout.loan.user.phoneNumber;
        const smsMessage = `Dear ${payout.loan.user.firstName} ${payout.loan.user.lastName}, your loan repayment of KES ${repayment.amountSettled.toFixed(2)} has been processed. Remaining balance: KES ${remainingLoanAmount.toFixed(2)}. Ref: ${reference || paymentBatch.reference}.`;

        try {
          //await sendSMS(tenantId, smsPhone, smsMessage);
          await tx.auditLog.create({
            data: {
              tenantId,
              userId: id,
              action: 'SEND_SMS',
              resource: 'NOTIFICATION',
              details: {
                recipient: smsPhone,
                message: smsMessage,
                reference: reference || paymentBatch.reference,
              },
            },
          });
        } catch (smsError) {
          console.error(`Failed to send SMS to ${smsPhone}:`, smsError);
        }
      }

      // Log the repayment action
      console.time('auditLogQuery');
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: id,
          action: 'CREATE',
          resource: 'REPAYMENT',
          details: {
            message: `User ${firstName} ${lastName} initiated repayment of ${totalAmount} for ${loanPayouts.length} loan payouts in organization ${organizationId}`,
            loanPayoutIds: loanPayouts.map(p => p.id),
            loanIds: loanPayouts.map(p => p.loanId),
            amount: totalAmount,
            remainingAmount,
            paymentMethod: method,
            reference: reference || `BATCH-${Date.now()}`,
            repayments: repayments.map(r => ({
              loanPayoutId: r.loanPayoutId,
              amountSettled: r.amountSettled,
            })),
          },
        },
      });
      console.timeEnd('auditLogQuery');

      return repayments;
    });

    res.status(201).json({
      message: `Repayment processed for ${repayments.length} loan payouts`,
      success: true,
      data: repayments,
    });
  } catch (error: any) {
    console.error('Error creating repayment:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message,
      success: false,
      data: null,
    });
  } finally {
    await prisma.$disconnect();
  }
};

export default createRepayment;




