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

    // Fetch all non-repaid loans for employees in the organization
    console.time('loansQuery');
    const loans: LoanRepayment[] = await prisma.loan.findMany({
      where: {
        organizationId,
        tenantId: tenantId,
        status: 'DISBURSED',
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        tenantId: true,
        amount: true,
        totalRepayable: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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
    });
    console.timeEnd('loansQuery');

    if (loans.length === 0) {
      res.status(400).json({
        message: 'No outstanding loans found for this organization',
        success: false,
        data: null,
      });
      return;
    }

    // Calculate total repayable amount
    const totalRepayable: number = loans.reduce((sum, loan) => sum + loan.totalRepayable, 0);
    if (totalAmount < totalRepayable) {
      res.status(400).json({
        message: `Repayment amount (${totalAmount}) is less than total repayable (${totalRepayable}) for ${loans.length} loans`,
        success: false,
        data: null,
      });
      return;
    }

    // Create PaymentBatch
    const paymentBatch = await prisma.paymentBatch.create({
      data: {
        tenantId,
        organizationId,
        totalAmount,
        paymentMethod: method,
        reference: reference || `BATCH-${Date.now()}`,
        remarks: remarks || undefined, // Store remarks if provided
      },
    });

    let remainingAmount = totalAmount;
    const repayments: loanPayment[] = [];

    for (const loan of loans) {
      if (remainingAmount <= 0) break;

      const outstanding = loan.totalRepayable;
      const payAmount = Math.min(outstanding, remainingAmount);

      // Create repayment record (PaymentConfirmation ties Batch -> Loan)
      const repayment: any = await prisma.paymentConfirmation.create({
        select: {
          id: true,
          amountSettled: true,
          settledAt: true,
          paymentBatchId: true,
          loanPayoutId: true,
        },
        data: {
          paymentBatchId: paymentBatch.id,
          loanPayoutId: loan.id,
          amountSettled: payAmount,
        },
      });

      repayments.push(repayment);

      // Update loan if fully settled
      if (payAmount >= outstanding) {
        await prisma.loan.update({
          where: { id: loan.id },
          data: { status: LoanStatus.REPAID },
        });
      }

      remainingAmount -= payAmount;
    }

    // Save remaining amount to organization credit balance
    if (remainingAmount > 0) {
      console.time('updateCreditBalance');
      await prisma.organization.update({
        where: { id: organizationId, tenantId: tenantId },
        data: {
          creditBalance: {
            increment: remainingAmount,
          },
        },
      });
      console.timeEnd('updateCreditBalance');

      console.time('auditLogCreditBalance');
      await prisma.auditLog.create({
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
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: id,
        action: 'CREATE',
        resource: 'REPAYMENT',
        details: {
          message: `User ${firstName} ${lastName} initiated repayment of ${totalAmount} for ${loans.length} loans in organization ${organizationId}`,
          loanIds: loans.map(loan => loan.id),
          amount: totalAmount,
          remainingAmount,
          paymentMethod: method,
          reference: reference || `BATCH-${Date.now()}`,
          remarks: remarks || undefined,
        },
      },
    });
    console.timeEnd('auditLogQuery');

    res.status(201).json({
      message: `Repayment processed for organization loans${remainingAmount > 0 ? `, ${remainingAmount} added to organization credit` : ''}`,
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



