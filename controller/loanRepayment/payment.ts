import { Request, Response } from 'express';
import {  LoanStatus, PrismaClient } from '@prisma/client';

import { AuthenticatedRequest } from '../../middleware/verifyToken';

import { ErrorResponse, LoanRepayment,  } from '../../types/loans/loan';




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




// Create repayment route handler



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
          message: 'ORG_ADMIN must have an employeeId',
          success: false,
          data: null,
        });
        return;
      }
      console.time('employeeQuery');
      const employee = await prisma.employee.findFirst({
        where: { id: userOrganizationId, tenantId: tenantId },
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
    } else if (
      role.includes('ADMIN') &&
      tenantId !== (await prisma.organization.findUnique({ where: { id: organizationId } }))?.tenantId
    ) {
      res.status(403).json({
        message: 'Unauthorized to initiate repayment for this organization',
        success: false,
        data: null,
      });
      return;
    }

    // Fetch all non-repaid loan payouts for the organization
    console.time('loanPayoutsQuery');
    const loanPayouts = await prisma.loanPayout.findMany({
      where: {
        tenantId: tenantId,
        status: 'DISBURSED', // Assumes PayoutStatus includes DISBURSED
        loan: {
          organizationId: organizationId, // Join with Loan to filter by organizationId
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
            totalRepayable: true, // Include totalRepayable for repayment calculations
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
                approvalSteps: true,
                name: true,
                loanLimitMultiplier: true,
                interestRate: true,
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
    const totalRepayable: number = loanPayouts.reduce((sum, payout) => sum + payout.loan.totalRepayable, 0);
    if (totalAmount < totalRepayable) {
      res.status(400).json({
        message: `Repayment amount (${totalAmount}) is less than total repayable (${totalRepayable}) for ${loanPayouts.length} loan payouts`,
        success: false,
        data: null,
      });
      return;
    }

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

        const outstanding = payout.loan.totalRepayable; // Use loan.totalRepayable
        const payAmount = Math.min(outstanding, remainingAmount);

        // Create repayment record (PaymentConfirmation ties Batch -> LoanPayout)
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
            loanPayoutId: payout.id, // Use LoanPayout id
            amountSettled: payAmount,
          },
        });

       repayments.push({ 
  ...repayment, 
  id: repayment.id.toString(), 
  paymentBatchId: repayment.paymentBatchId.toString(), 
  loanPayoutId: repayment.loanPayoutId.toString() 
});
        // Update LoanPayout and Loan if fully settled
        if (payAmount >= outstanding) {
          
          await tx.loan.update({
            where: { id: payout.loanId },
            data: { status: 'REPAID' }, // Update Loan status to REPAID
          });
        }

        remainingAmount -= payAmount;
      }

      // Save remaining amount to organization credit balance
      if (remainingAmount > 0) {
        console.time('updateCreditBalance');
        await tx.organization.update({
          where: { id: organizationId, tenantId: tenantId },
          data: {
            creditBalance: {
              increment: remainingAmount,
            },
          },
        });
        console.timeEnd('updateCreditBalance');

        console.time('auditLogCreditBalance');
        await tx.auditLog.create({
          data: {
            tenantId: tenantId,
            userId: id,
            action: 'UPDATE',
            resource: 'ORGANIZATION_CREDIT',
            details: {
              message: `User ${firstName} ${lastName} added ${remainingAmount} to organization ${organizationId} credit balance`,
              organizationId,
              amount: remainingAmount,
              paymentMethod: method,
              reference: reference || `BATCH-${Date.now()}`,
              remarks: remarks || undefined,
            },
          },
        });
        console.timeEnd('auditLogCreditBalance');
      }

      // Log the repayment action
      console.time('auditLogQuery');
      await tx.auditLog.create({
        data: {
          tenantId: tenantId,
          userId: id,
          action: 'CREATE',
          resource: 'REPAYMENT',
          details: {
            message: `User ${firstName} ${lastName} initiated repayment of ${totalAmount} for ${loanPayouts.length} loan payouts in organization ${organizationId}`,
            loanPayoutIds: loanPayouts.map(payout => payout.id),
            loanIds: loanPayouts.map(payout => payout.loanId), // Log both loanPayoutIds and loanIds
            amount: totalAmount,
            remainingAmount,
            paymentMethod: method,
            reference: reference || `BATCH-${Date.now()}`,
            remarks: remarks || undefined,
          },
        },
      });
      console.timeEnd('auditLogQuery');

      return repayments;

    });

    res.status(201).json({
      message: `Repayment processed for organization loan payouts }`,
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



