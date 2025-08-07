import { Request, Response, NextFunction } from 'express';
import { PrismaClient, LoanStatus, PayoutStatus, TenantStatus } from '@prisma/client';

import { AuthenticatedRequest } from "../../middleware/verifyToken";

import { Loan, LoanPayout,DisbursementResult, MpesaResponse } from "../../types/loans/loan";
import { disburseB2CPayment } from "../mpesa/initiateB2CPayment";
import { fetchLatestBalance } from "../mpesa/mpesaConfig";
import { sendSMS } from "../sms/sms";
import { getTransactionFee } from './getTrasactionFees';

const prisma = new PrismaClient();



async function checkUserAuthorization(req: AuthenticatedRequest, loan: Loan) {
  const { id: userId, tenantId, role } = req.user!;

  if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
    throw { status: 403, message: 'Only ORG_ADMIN or ADMIN can approve loans' };
  }

  if (role.includes('ORG_ADMIN')) {
    const employee = await prisma.employee.findFirst({
      where: { id: userId },
      select: { organizationId: true ,organization:true, },
    });
    if (!employee || loan.organizationId !== employee.organizationId) {
      throw { status: 403, message: 'Unauthorized to approve this loan' };
    }
  } else if (role.includes('ADMIN') && loan.tenantId !== tenantId) {
    throw { status: 403, message: 'Unauthorized to approve this loan' };
  }

 if (loan.organization && loan?.organization?.approvalSteps > 1 && (loan.firstApproverId === userId || loan.secondApproverId === userId)) {
  throw { status: 400, message: 'Duplicate approval: You have already approved this loan' };
}
}

async function performDisbursement(loan: Loan, userId: number): Promise<{ payout: LoanPayout; result?: MpesaResponse }> {
  const payout = await prisma.loanPayout.create({
    data: {
      loanId: loan.id,
      amount: loan.amount,
      method: 'MPESA',
      status: PayoutStatus.PENDING,
      approvedById: userId,
      tenantId: loan.tenantId,
    },
  });

 // const balanceRecord = await fetchLatestBalance(loan.tenantId);
  //const availableBalance = balanceRecord?.utilityAccountBalance ?? 0;

  // if (availableBalance < loan.amount) {
  //   await prisma.loanPayout.update({ where: { id: payout.id }, data: { status: PayoutStatus.FAILED } });
  //   await sendDisbursementFailureAudit(loan, userId, 'Insufficient balance');
  //   await notifyUserDisbursementFailure(loan, 'due to insufficient funds');
  //   return { payout };
  // }

  const phoneNumber = loan.user.phoneNumber.startsWith('+254')
    ? loan.user.phoneNumber.replace('+', '')
    : `254${loan.user.phoneNumber.replace(/^0/, '')}`;



  const result = await disburseB2CPayment({
    phoneNumber,
    amount: loan.amount,
    loanId: loan.id,
    userId,
    tenantId: loan.tenantId,
  });

  if (!result || !result.mpesaResponse) {
    throw new Error('Disbursement failed: No MPESA response received');
  }


  await prisma.loanPayout.update({
    where: { id: payout.id },
    data: {
      transactionId: result.mpesaResponse.transactionId,
      status: PayoutStatus.DISBURSED,
    },
  });

  return { payout, result };
}




async function sendDisbursementFailureAudit(loan: Loan, userId: number, reason: string) {
  await prisma.auditLog.create({
    data: {
      tenant: { connect: { id: loan.tenantId } },
      user: { connect: { id: userId } },
      action: 'DISBURSEMENT_FAILED',
      resource: 'LOAN',
      details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason }),
    },
  });
}

async function notifyUserDisbursementFailure(loan: Loan, reason: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: loan.tenantId }, select: { name: true } });
  await sendSMS(
    loan.tenantId,
    loan.user.phoneNumber,
    `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed ${reason}.`
  );
}

async function approveStep(loan: Loan, userId: number): Promise<Loan> {
  const newCount = loan.approvalCount + 1;
  let updateData: any = { approvalCount: newCount };

  if (loan.organization.approvalSteps === 1 || newCount === 2) {
    updateData.status = 'APPROVED';
  }
  if (newCount === 1) updateData.firstApproverId = userId;
  if (newCount === 2) updateData.secondApproverId = userId;

  return prisma.loan.update({
    where: { id: loan.id },
    data: updateData,
    include: {
      user: { select: { id: true, firstName: true, phoneNumber: true, lastName: true } },
      organization: {
        select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true, interestRate: true },
      },
      consolidatedRepayment: true,
      LoanPayout: true,
    },
  });
}


export const approveLoan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id: userId, tenantId } = req.user!;
  const { id } = req.params;

  try {
    if (!id) throw { status: 400, message: 'Loan ID is required' };

    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { id: true, firstName: true, phoneNumber: true, lastName: true ,} },
        tenant: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true, interestRate: true , interestRateType: true,dailyInterestRate: true,} },
        consolidatedRepayment: true,
        LoanPayout: true,
      },
    });

    if (!loan) throw { status: 404, message: 'Loan not found' };
    if (loan.status !== 'PENDING') throw { status: 400, message: 'Loan is not in PENDING status' };

    await checkUserAuthorization(req, loan);
    const updatedLoan = await approveStep(loan, userId);

    let payout: LoanPayout | undefined;
    let result: MpesaResponse | undefined;

    if (updatedLoan.status === 'APPROVED') {
      ({ payout, result } = await performDisbursement(updatedLoan, userId));




  const interestDescription =
    loan.organization?.interestRateType === 'DAILY'
      ? `at a daily interest of ${(loan.organization.dailyInterestRate * 100).toFixed(2)}% per day`
      : `at a monthly interest of ${(loan.organization.interestRate * 100).toFixed(2)}%`;

  const dueDateFormatted = loan.dueDate.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });



  const message = `Dear ${loan.user.firstName}, your loan of KES ${loan.amount.toLocaleString()} at ${loan.tenant.name} has been approved and disbursement initiated ${interestDescription}. Transaction charge is KES ${loan.transactionCharge.toLocaleString()}. Due date: ${dueDateFormatted}. Total payable ${loan.totalRepayable.toLocaleString()} `;

      await sendSMS(
        loan.tenantId,
        loan.user.phoneNumber,
        message
      );
    }

    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: userId } },
        action: 'APPROVE',
        resource: 'LOAN',
        details: JSON.stringify({ loanId: loan.id, approvalCount: updatedLoan.approvalCount }),
      },
    });

    res.status(200).json({
      success: true,
      message: updatedLoan.status === 'APPROVED' ? 'Loan approved and disbursed' : 'Loan approved (pending next step)',
      data: { loan: updatedLoan, loanPayout: payout, disbursement: result },
    });
  } catch (error: any) {
    console.error('Loan approval error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Internal error' });
  }
};
