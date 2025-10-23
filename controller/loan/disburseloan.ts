import { Request, Response, NextFunction } from 'express';
import { PrismaClient, LoanStatus, PayoutStatus, TenantStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { Employee, LoanToDisburse, MpesaResponseDisburse } from '../../types/loans/disburse';
import { disburseB2CPayment } from '../mpesa/initiateB2CPayment';
import { getTransactionFee } from './getTrasactionFees';


const prisma = new PrismaClient();



export const disburseLoan = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const { id } = req.params;
  const user = req.user;

  // Validate user and required fields
  if (!user || !user.id || !user.tenantId || !user.role || !user.firstName || !user.lastName) {
    return res.status(401).json({
      message: 'Unauthorized: User not authenticated or missing required fields',
      userDetails: user,
    });
  }

  // Check user roles
  if (!user.role.includes('ORG_ADMIN') && !user.role.includes('ADMIN')) {
    return res.status(403).json({ message: 'Only ORG_ADMIN or ADMIN can disburse loans' });
  }

  try {
    console.time('loanQuery');
    const loan: LoanToDisburse | null = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        status: true,
        amount: true,
        organizationId: true,
        tenantId: true,
        disbursedAt: true,
        user: {
          select: {
            id: true,
            phoneNumber: true,
          },
        },
      },
    });
    console.timeEnd('loanQuery');

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'APPROVED') {
      return res.status(400).json({ message: 'Loan must be APPROVED to disburse' });
    }

    if (loan.disbursedAt) {
      return res.status(400).json({ message: 'Loan has already been disbursed' });
    }

    // Validate permissions based on role
    if (user.role.includes('ORG_ADMIN')) {
      console.time('employeeQuery');
      const employee: Employee | null = await prisma.employee.findFirst({
        where: { id: user.id, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      console.timeEnd('employeeQuery');

      if (!employee || loan.organizationId !== employee.organizationId) {
        return res.status(403).json({ message: 'Unauthorized to disburse this loan' });
      }
    } else if (user.role.includes('ADMIN') && loan.tenantId !== user.tenantId) {
      return res.status(403).json({ message: 'Unauthorized to disburse this loan' });
    }


      //const transactionFee = await getTransactionFee(loan.amount, loan.tenantId);

    // Normalize phone number for M-Pesa

const rawPhone = loan.user.phoneNumber || ''; // value from DB
let phone = rawPhone.trim().replace(/[\s-]/g, ''); // remove spaces/hyphens

if (phone.startsWith('+254')) {
  phone = phone.replace('+', '');
} else if (phone.startsWith('0')) {
  phone = `254${phone.slice(1)}`;
} else if (!phone.startsWith('254')) {
  phone = `254${phone}`;
}

const phoneNumber = phone;


    // Call M-Pesa API
    const mpesaResponse: MpesaResponseDisburse = await disburseB2CPayment({
      phoneNumber,
      amount: loan.amount,

    });

    console.time('loanUpdateQuery');
    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: {
        disbursedAt: new Date(),
       // transactionFee:transactionFee,
        mpesaTransactionId: mpesaResponse.ConversationID || mpesaResponse.OriginatorConversationID,
        mpesaStatus: mpesaResponse.ResponseCode === '0' ? 'PENDING' : 'FAILED',
      },
    });
    console.timeEnd('loanUpdateQuery');

    console.time('auditLogQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: user.id } },
        action: 'DISBURSE',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          amount: loan.amount,
          phoneNumber,
          mpesaTransactionId: mpesaResponse.ConversationID || mpesaResponse.OriginatorConversationID,
          message: `Loan ${id} disbursed to ${phoneNumber} by ${user.firstName} ${user.lastName}`,
        },
      },
    });
    console.timeEnd('auditLogQuery');

    return res.status(200).json({
      message: 'Loan disbursement initiated',
      loan: updatedLoan,
      mpesaResponse,
    });
  } catch (error: any) {
    console.error('Error disbursing loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};
