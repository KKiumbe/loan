import { Request, Response, NextFunction } from 'express';
import { PrismaClient, LoanStatus, PayoutStatus, TenantStatus } from '@prisma/client';
import ROLE_PERMISSIONS from '../../DatabaseConfig/role';
import { disburseB2CPayment } from '../mpesa/initiateB2CPayment';
import { sendSMS } from '../sms/sms';
import { fetchLatestBalance } from '../mpesa/mpesaConfig';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { ApiResponse, AutoApprovalResponse, DisbursementResult, ErrorResponse, Loan, LoanbyId, LoanDetails, LoanPayout, Organization, UnpaidLoan, User } from '../../types/loan';
import { Employee, LoanToDisburse, MpesaResponseDisburse } from '../../types/disburse';

const prisma = new PrismaClient();




// Helper Functions
export const calculateLoanDetails = (amount: number, interestRate: number): LoanDetails => {
  if (!interestRate || isNaN(interestRate) || interestRate < 0) {
    throw new Error('Invalid interest rate');
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid loan amount');
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const totalRepayable = amount * (1 + interestRate);

  if (isNaN(totalRepayable)) {
    throw new Error('Failed to calculate total repayable');
  }

  return { dueDate, totalRepayable };
};

type MinimalLoan = {
  id: number;
  amount: number;
  tenantId: number;
  disbursedAt: Date | null;
  user: { id: number; firstName: string; phoneNumber: string , lastName: string};
  organization: { id: number; name: string };
};


export const createLoan = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<AutoApprovalResponse> | ErrorResponse>
): Promise<void> => {
  try {
    const { amount } = req.body;
    const { id: userId, tenantId, role, firstName, lastName, phoneNumber } = req.user!;

    if (!userId || !tenantId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    if (!role.includes('EMPLOYEE')) {
      res.status(403).json({ message: 'Only employees with loan creation permission can apply for loans' });
      return;
    }

    if (!amount || amount <= 0) {
      res.status(400).json({ message: 'Valid loan amount is required' });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { phoneNumber },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        grossSalary: true,
        phoneNumber: true,
        organization: true,
      },
    });

    if (!employee) {
      res.status(400).json({ message: 'Account not linked to an employee record' });
      return;
    }

    const org = employee.organization;
    if (!org) {
      res.status(500).json({ message: 'Employee has no organization' });
      return;
    }

    const monthlyCap = employee.grossSalary * org.loanLimitMultiplier;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { _sum } = await prisma.loan.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        tenantId,
        status: { in: ['PENDING', 'APPROVED'] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });

    const takenSoFar = _sum.amount ?? 0;
    if (takenSoFar + amount > monthlyCap) {
      res.status(400).json({
        message: `Cap exceeded. Borrowed KES ${takenSoFar} of KES ${monthlyCap}.`,
      });
      return;
    }

    const { dueDate, totalRepayable } = calculateLoanDetails(amount, org.interestRate);

    // Create loan with initial status based on approvalSteps
    const loan = await prisma.loan.create({
      data: {
        user: { connect: { id: userId } },
        organization: { connect: { id: org.id } },
        tenant: { connect: { id: tenantId } },
        amount,
        interestRate: org.interestRate,
        dueDate,
        totalRepayable,
        status: org.approvalSteps === 0 ? 'APPROVED' : 'PENDING',
        approvalCount: org.approvalSteps === 0 ? 0 : 0,
       
      },
      include: {
        organization: { select: { id: true, name: true, approvalSteps: true ,loanLimitMultiplier:true, interestRate:true} },
        user: { select: { id: true, firstName: true, phoneNumber: true ,lastName:true} },
        consolidatedRepayment:true,
        LoanPayout:true
      },
    });

    // Audit log for loan creation
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'CREATE',
        resource: 'LOAN',
        details: JSON.stringify({ loanId: loan.id, amount }),
      },
    });

    // Handle auto-approval for approvalSteps === 0
    if (org.approvalSteps === 0) {




//    const sanitizedLoan: MinimalLoan & {
//   user: { id: number; firstName: string; phoneNumber: string };
//   organization: { id: number; name: string };
  
//   tenantId: number;
// } = {
//   ...loan,
//   user: { id: userId, firstName, phoneNumber ,lastName},
//   organization: {
//     id: org.id,
//     name: org.name,
//   },
// };
type DisbursableLoan = Pick<Loan, 'id' | 'amount' | 'tenantId' | 'disbursedAt'> & {
  user: Pick<User, 'id' | 'firstName' | 'phoneNumber'| 'lastName'>;
  organization: Pick<Organization, 'id' | 'name'>;
};


const disbursableLoan = {
  id: loan.id,
  amount: loan.amount,
  tenantId: loan.tenantId,
  disbursedAt: loan.disbursedAt,
  user: {
    id: loan.user.id,
    firstName: loan.user.firstName,
    phoneNumber: loan.user.phoneNumber,
    lastName: loan.user.lastName
  },
  organization: {
    id: loan.organization.id,
    name: loan.organization.name,
  },
} satisfies DisbursableLoan;



await createPayoutAndDisburse(disbursableLoan, prisma);



      if ('message' in disbursableLoan) {
        // Disbursement failed

        res.status(400).json({
          success: false,
          message: 'Loan auto-approved but disbursement failed',
          data: loan, // assuming loan is a Loan object
          error: 'Disbursement failed'
        } as unknown as ApiResponse<AutoApprovalResponse>);

   
 
        return;
      }

      // Audit log for auto-approval
      await prisma.auditLog.create({
        data: {
          tenant: { connect: { id: tenantId } },
          user: { connect: { id: userId } },
          action: 'AUTO_APPROVE',
          resource: 'LOAN',
          details: JSON.stringify({
            loanId: loan.id,
            message: `Loan ${loan.id} auto-approved (0 approval steps required)`,
          }),
        },
      });

      // Notify user of auto-approval
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });

      await sendSMS(
        tenantId,
        phoneNumber,
        `Dear ${firstName}, your loan of KES ${amount} at ${tenant?.name ?? 'the organization'} has been auto-approved. Disbursement initiated. Contact support for queries.`
      ).catch((error) => console.error(`Failed to send SMS to ${phoneNumber}:`, error));

      res.status(201).json({
        message: 'Loan auto-approved and disbursement initiated',
        data: { loan: updatedLoan || loan, loanPayout, disbursement },
      });
      return;
    }

    // Handle manual approval cases (approvalSteps > 0)
    const applicantName = `${firstName} ${lastName}`;
    const orgAdmins = await prisma.user.findMany({
      where: { tenantId, organizationId: org.id, role: { has: 'ORG_ADMIN' }, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, phoneNumber: true },
    });

    if (orgAdmins.length === 0) {
      console.warn(`No ORG_ADMINs found for org ${org.id}, notifying tenant-level ADMINs...`);
      const tenantAdmins = await prisma.user.findMany({
        where: { tenantId, role: { has: 'ADMIN' }, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, phoneNumber: true },
      });

      await Promise.all(
        tenantAdmins.map((admin) =>
          sendSMS(
            tenantId,
            admin.phoneNumber,
            `Hello ${admin.firstName}, new loan request #${loan.id} for KES ${amount} by ${applicantName}. Please review.`
          ).catch((error) => console.error(`Failed to send SMS to ${admin.phoneNumber}:`, error))
        )
      );
    } else {
      await Promise.all(
        orgAdmins.map((admin) =>
          sendSMS(
            tenantId,
            admin.phoneNumber,
            `Hello ${admin.firstName}, new loan request #${loan.id} for KES ${amount} by ${applicantName}. Please review.`
          ).catch((error) => console.error(`Failed to send SMS to ${admin.phoneNumber}:`, error))
        )
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    await sendSMS(
      tenantId,
      phoneNumber,
      `Dear ${firstName}, your KES ${amount} loan at ${tenant?.name ?? 'the organization'} is pending approval.`
    ).catch((error) => console.error(`Failed to send SMS to ${phoneNumber}:`, error));

    res.status(201).json({ 
  message: 'Loan auto-approved but disbursement failed', 
  data: { 
    loan: loan, 
    loanPayout: null, 
    disbursement: null 
  } as AutoApprovalResponse 
});
    return;
  } catch (error: unknown) {
    console.error('Error creating loan:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
    return;
  }
};


const createPayoutAndDisburse = async (
  loan: MinimalLoan & {
    user: { id: number; firstName: string; phoneNumber: string };
    organization: { id: number; name: string };
    tenantId: number;
  },
  //approverId: string | null, // null for auto-approval
  prisma: PrismaClient
): Promise<{
  loanPayout: LoanPayout | { message: string; payout: LoanPayout };
  disbursement?: DisbursementResult | undefined;
  updatedLoan: MinimalLoan | null;
}> => {
  let loanPayout: LoanPayout | null = null;
  let disbursementResult: DisbursementResult | undefined;
  let updatedLoan: MinimalLoan | null = null;

  // Create payout record
  loanPayout = await prisma.loanPayout.create({
    data: {
      loanId: loan.id,
      amount: loan.amount,
      method: 'MPESA',
      status: PayoutStatus.PENDING,
      approvedById: null,
      tenantId: loan.tenantId,
      transactionId: null,
    },
  });

  if (!loan.disbursedAt) {
    const balanceRecord = await fetchLatestBalance(loan.tenantId);
    const availableBalance = balanceRecord?.utilityAccountBalance ?? 0;
    console.log(`Fetched balance for tenant ${loan.tenantId}: KES ${availableBalance}. Proceeding with disbursement.`);

    if (availableBalance < loan.amount) {
      await prisma.loanPayout.update({
        where: { id: loanPayout.id },
        data: { status: PayoutStatus.FAILED },
      });

      await prisma.auditLog.create({
        data: {
          tenant: { connect: { id: loan.tenantId } },
          user: { connect: { id: loan.user.id } },
          action: 'DISBURSEMENT_FAILED',
          resource: 'LOAN',
          details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: 'Insufficient balance' }),
        },
      });

      const tenant = await prisma.tenant.findUnique({
        where: { id: loan.tenantId },
        select: { name: true },
      });

      await sendSMS(
        loan.tenantId,
        loan.user.phoneNumber,
        `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to insufficient funds.`
      ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));

      return {
        loanPayout: { message: 'Payout created but failed due to insufficient balance', payout: loanPayout },
        disbursement: undefined,
        updatedLoan,
      };
    }

    const phoneNumber = loan.user.phoneNumber.startsWith('+254')
      ? loan.user.phoneNumber.replace('+', '')
      : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

    try {
      disbursementResult = await disburseB2CPayment({
        phoneNumber,
        amount: loan.amount,
        loanId: loan.id,
        userId: loan.user.id,
        tenantId: loan.tenantId,
      });

      if (!disbursementResult || !disbursementResult.mpesaResponse) {
        throw new Error('Disbursement failed: No MPESA response received');
      }

      updatedLoan = await prisma.loan.findUnique({
        where: { id: loan.id },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              approvalSteps: true,
              loanLimitMultiplier: true,
              interestRate: true,
            },
          },
          consolidatedRepayment: true,
          LoanPayout: true,
          user: { select: { id: true, firstName: true, phoneNumber: true ,lastName:true} },
        },
      });

      if (!updatedLoan) {
        throw new Error('Loan not found after disbursement');
      }

      loanPayout = await prisma.loanPayout.update({
        where: { id: loanPayout.id },
        data: {
          transactionId: disbursementResult.mpesaResponse.transactionId,
          status: PayoutStatus.DISBURSED,
        },
      });
    } catch (err: unknown) {
      console.error('Disbursement failed:', JSON.stringify(err, null, 2));
      loanPayout = await prisma.loanPayout.update({
        where: { id: loanPayout.id },
        data: { status: PayoutStatus.FAILED },
      });

      await prisma.auditLog.create({
        data: {
          tenant: { connect: { id: loan.tenantId } },
          user: { connect: { id: loan.user.id } },
          action: 'DISBURSEMENT_FAILED',
          resource: 'LOAN',
          details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: (err as Error).message }),
        },
      });

      const tenant = await prisma.tenant.findUnique({
        where: { id: loan.tenantId },
        select: { name: true },
      });

      await sendSMS(
        loan.tenantId,
        loan.user.phoneNumber,
        `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to an error.`
      ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));

      return {
        loanPayout: { message: 'Payout created but failed due to error', payout: loanPayout },
        disbursement: undefined,
        updatedLoan,
      };
    }
  }

  return { loanPayout, disbursement: disbursementResult, updatedLoan };
};


export const getLoans = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Loan[]> | ErrorResponse>,

): Promise<void> => {
  const { id: userId, tenantId, role, firstName, lastName } = req.user!;

  try {
    if (!role.some((r) => ROLE_PERMISSIONS[r as keyof typeof ROLE_PERMISSIONS]?.loan?.includes('read'))) {
     res.status(403).json({ message: 'Unauthorized to view loans' });
      return;
    }

    let loans: MinimalLoan[] = [];

    if (role.includes('EMPLOYEE')) {
      loans = await prisma.loan.findMany({
        where: { userId, tenantId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              approvalSteps: true,
              loanLimitMultiplier: true,
              interestRate: true,
            },
          },
          consolidatedRepayment: true,
          user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true  } },
        },
      });
    } else if (role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: tenantId },
        select: { organizationId: true },
      });
      if (!employee) {
       res.status(404).json({ message: 'Employee not found' });
        return;
      }
      loans = await prisma.loan.findMany({
        where: { organizationId: employee.organizationId, tenantId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
          organization: {
            select: {
              id: true,
              name: true,
              approvalSteps: true,
              loanLimitMultiplier: true,
              interestRate: true,
            },
          },
          consolidatedRepayment: true,
          
          
          
        },
      });
    } else if (role.includes('ADMIN')) {
      loans = await prisma.loan.findMany({
        where: { tenantId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
          organization: {
            select: {
              id: true,
              name: true,
              approvalSteps: true,
              loanLimitMultiplier: true,
              interestRate: true,
            },
          },
          consolidatedRepayment: true,
        },
      });
    } else {
       res.status(403).json({ message: 'Unauthorized to view loans' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'READ',
        resource: 'LOAN',
        details: JSON.stringify({
          loanCount: loans.length,
          user: `${firstName} ${lastName}`,
        }),
      },
    });

   res.status(200).json({ message: 'Loans retrieved successfully', data: loans });
    return;

  } catch (error: unknown) {
    console.error('Error fetching loans:', error);
     res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
      return;
  } finally {
    await prisma.$disconnect();
  }
};

// Get a specific loan by ID
export const getLoanById = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<LoanbyId> | ErrorResponse>,
  
): Promise<void> => {
  const { id } = req.params;
  const { id: userId, tenantId, role} = req.user!;

  try {
    if (!id) {
      res.status(400).json({ message: 'Loan ID is required' });
      return;
    }

    if (!role.some((r) => ROLE_PERMISSIONS[r as keyof typeof ROLE_PERMISSIONS]?.loan?.includes('read'))) {
      res.status(403).json({ message: 'Unauthorized to view loans' });
      return;
    }

    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
        organization: { select: { id: true, name: true, approvalSteps: true } },
        consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
      },
    });

    if (!loan) {
    res.status(404).json({ message: 'Loan not found' });
      return;
    }

    if (role.includes('EMPLOYEE') && loan.userId !== userId) {
      res.status(403).json({ message: 'Unauthorized to view this loan' });
      return;
    } else if (role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: tenantId },
        select: { organizationId: true },
      });
      if (!employee || loan.organizationId !== employee.organizationId) {
        res.status(403).json({ message: 'Unauthorized to view this loan' });
        return;
      }
    } else if (!role.includes('ADMIN') && loan.tenantId !== tenantId) {
       res.status(403).json({ message: 'Unauthorized to view this loan' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'READ',
        resource: 'LOAN',
        details: JSON.stringify({ loanId: loan.id }),
      },
    });

    res.status(200).json({ 
      success: true,
      error: null,
      message: 'Loan retrieved successfully', 
      data: loan });
    return;
  } catch (error: unknown) {
    console.error('Error fetching loan:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
    return;
  } 
};

// Approve a loan




export const approveLoan = async (
  req: AuthenticatedRequest,
  res: Response<
    ApiResponse<{
      loan: Loan;
      loanPayout?: LoanPayout | { message: string; payout: LoanPayout };
      disbursement?: DisbursementResult;
    }> | ErrorResponse
  >,

): Promise<void> => {
  const { id } = req.params;
  const { id: userId, tenantId, role, firstName, lastName } = req.user!;

  try {
    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Loan ID is required',
        error: 'Loan ID is required',
      });
      return;
    }

    if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
      res.status(403).json({
        success: false,
        message: 'Only ORG_ADMIN or ADMIN can approve loans',
        error: 'Forbidden',
      });
      return;
    }

    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { id: true, firstName: true, phoneNumber: true } },
        organization: {
          select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true, interestRate: true },
        },
        consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
        LoanPayout: true,
      },
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        message: 'Loan not found',
        error: 'Loan not found',
      });
      return;
    }

    if (loan.status !== 'PENDING') {
      res.status(400).json({
        success: false,
        message: 'Loan is not in PENDING status',
        error: 'Invalid loan status',
      });
      return;
    }

    if (role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: userId }, // Fixed: Use userId instead of tenantId
        select: { organizationId: true },
      });
      if (!employee || loan.organizationId !== employee.organizationId) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to approve this loan',
          error: 'Forbidden',
        });
        return;
      }
    } else if (role.includes('ADMIN') && loan.tenantId !== tenantId) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to approve this loan',
        error: 'Forbidden',
      });
      return;
    }

    if (loan.organization.approvalSteps > 1 && (loan.firstApproverId === userId || loan.secondApproverId === userId)) {
      res.status(400).json({
        success: false,
        message: 'You have already approved this loan. A different approver is required.',
        error: 'Duplicate approval',
      });
      return;
    }

    let updatedLoan: Loan | null = null;
    let loanPayout: LoanPayout | null = null;
    let disbursementResult: DisbursementResult | null = null;

    if (loan.organization.approvalSteps === 1) {
      updatedLoan = await prisma.loan.update({
        where: { id: parseInt(id) },
        data: { status: 'APPROVED', approvalCount: loan.approvalCount + 1, firstApproverId: userId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              approvalSteps: true,
              loanLimitMultiplier: true,
              interestRate: true,
            },
          },
          consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
          LoanPayout: true,
        },
      });

      if (!updatedLoan) {
        res.status(404).json({
          success: false,
          message: 'Loan not found after approval',
          error: 'Loan not found',
        });
        return;
      }


      loanPayout = await prisma.loanPayout.create({
        data: {
          loanId: loan.id,
          amount: loan.amount,
          method: 'MPESA',
          status: PayoutStatus.PENDING,
          approvedById: userId,
          tenantId: loan.tenantId,
          transactionId: null,
        },
      });

      if (!loan.disbursedAt) {
        const balanceRecord = await fetchLatestBalance(loan.tenantId);
        const availableBalance = balanceRecord?.utilityAccountBalance ?? 0;
        console.log(`Fetched balance for tenant ${loan.tenantId}: KES ${availableBalance}. Proceeding with disbursement.`);

        if (availableBalance < loan.amount) {
          await prisma.loanPayout.update({
            where: { id: loanPayout.id },
            data: { status: PayoutStatus.FAILED },
          });

          await prisma.auditLog.create({
            data: {
              tenant: { connect: { id: loan.tenantId } },
              user: { connect: { id: userId } },
              action: 'DISBURSEMENT_FAILED',
              resource: 'LOAN',
              details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: 'Insufficient balance' }),
            },
          });

          const tenant = await prisma.tenant.findUnique({
            where: { id: loan.tenantId },
            select: { name: true },
          });

          await sendSMS(
            loan.tenantId,
            loan.user.phoneNumber,
            `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to insufficient funds.`
          ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));

          res.status(400).json({
            success: false,
            message: 'Loan approved but disbursement failed',
            data: { loan: updatedLoan, loanPayout: { message: 'Payout created but failed due to insufficient balance', payout: loanPayout } },
          });
          return;
        }

        const phoneNumber = loan.user.phoneNumber.startsWith('+254')
          ? loan.user.phoneNumber.replace('+', '')
          : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

        try {
          disbursementResult = await disburseB2CPayment({
            phoneNumber,
            amount: loan.amount,
            loanId: loan.id,
            userId: userId,
            tenantId: loan.tenantId,
          });

          if (!disbursementResult || !disbursementResult.mpesaResponse) {
            throw new Error('Disbursement failed: No MPESA response received');
          }

          updatedLoan = await prisma.loan.findUnique({
            where: { id: loan.id },
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  approvalSteps: true,
                  loanLimitMultiplier: true,
                  interestRate: true,
                },
              },
              consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
              LoanPayout: true,
            },
          });
         

        

          // Null check for disbursementResult
          loanPayout = await prisma.loanPayout.update({
            where: { id: loanPayout.id },
            data: {
              transactionId: disbursementResult && disbursementResult.mpesaResponse ? disbursementResult.mpesaResponse.transactionId : null,
              status: PayoutStatus.DISBURSED,
            },
          });
        } catch (err: unknown) {
          console.error('Disbursement failed:', JSON.stringify(err, null, 2));
          loanPayout = await prisma.loanPayout.update({
            where: { id: loanPayout.id },
            data: { status: PayoutStatus.FAILED },
          });

          await prisma.auditLog.create({
            data: {
              tenant: { connect: { id: loan.tenantId } },
              user: { connect: { id: userId } },
              action: 'DISBURSEMENT_FAILED',
              resource: 'LOAN',
              details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: (err as Error).message }),
            },
          });

          const tenant = await prisma.tenant.findUnique({
            where: { id: loan.tenantId },
            select: { name: true },
          });

          await sendSMS(
            loan.tenantId,
            loan.user.phoneNumber,
            `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to an error.`
          ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));

          // res.status(400).json({
          //   success: false,
          //   message: 'Loan approved but disbursement failed',
          //   data: { loan:null, loanPayout: { message: 'Payout created but failed', payout: loanPayout } },
            
          // });
          // return;
        }
      }
    } else if (loan.organization.approvalSteps === 2) {
      const newApprovalCount = loan.approvalCount + 1;
      if (newApprovalCount === 1) {
        updatedLoan = await prisma.loan.update({
          where: { id: parseInt(id) },
          data: { approvalCount: newApprovalCount, firstApproverId: userId },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                approvalSteps: true,
                loanLimitMultiplier: true,
                interestRate: true,
              },
            },
            consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
            LoanPayout: true,
          },
        });
      } else if (newApprovalCount === 2) {
        updatedLoan = await prisma.loan.update({
          where: { id: parseInt(id) },
          data: { status: 'APPROVED', approvalCount: newApprovalCount, secondApproverId: userId },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                approvalSteps: true,
                loanLimitMultiplier: true,
                interestRate: true,
              },
            },
            consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
            LoanPayout: true,
          },
        });

        loanPayout = await prisma.loanPayout.create({
          data: {
            loanId: loan.id,
            amount: loan.amount,
            method: 'MPESA',
            status: PayoutStatus.PENDING,
            approvedById: userId,
            tenantId: loan.tenantId,
            transactionId: null,
          },
        });

        if (!loan.disbursedAt) {
          const balanceRecord = await fetchLatestBalance(loan.tenantId);
          const availableBalance = balanceRecord?.utilityAccountBalance ?? 0;
          console.log(`Fetched balance for tenant ${loan.tenantId}: KES ${availableBalance}. Proceeding with disbursement.`);

          if (availableBalance < loan.amount) {
            await prisma.loanPayout.update({
              where: { id: loanPayout.id },
              data: { status: PayoutStatus.FAILED },
            });

            await prisma.auditLog.create({
              data: {
                tenant: { connect: { id: loan.tenantId } },
                user: { connect: { id: userId } },
                action: 'DISBURSEMENT_FAILED',
                resource: 'LOAN',
                details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: 'Insufficient balance' }),
              },
            });

            const tenant = await prisma.tenant.findUnique({
              where: { id: loan.tenantId },
              select: { name: true },
            });

            await sendSMS(
              loan.tenantId,
              loan.user.phoneNumber,
              `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to insufficient funds.`
            ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));

            res.status(400).json({
              success: false,
              message: 'Loan approved but disbursement failed',
              data: { loan: updatedLoan, loanPayout: { message: 'Payout created but failed due to insufficient balance', payout: loanPayout } },
            });
            return;
          }

          const phoneNumber = loan.user.phoneNumber.startsWith('+254')
            ? loan.user.phoneNumber.replace('+', '')
            : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

          try {
            disbursementResult = await disburseB2CPayment({
              phoneNumber,
              amount: loan.amount,
              loanId: loan.id,
              userId: userId,
              tenantId: loan.tenantId,
            });

            updatedLoan = await prisma.loan.findUnique({
              where: { id: loan.id },
              include: {
                organization: {
                  select: {
                    id: true,
                    name: true,
                    approvalSteps: true,
                    loanLimitMultiplier: true,
                    interestRate: true,
                  },
                },
                consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
                LoanPayout: true,
              },
            });

            if (!updatedLoan) {
              throw new Error('Loan not found after disbursement');
            }

            // Null check for disbursementResult
            loanPayout = await prisma.loanPayout.update({
              where: { id: loanPayout.id },
              data: {
                transactionId: disbursementResult && disbursementResult.mpesaResponse ? disbursementResult.mpesaResponse.transactionId : null,
                status: PayoutStatus.DISBURSED,
              },
            });
          } catch (err: unknown) {
            console.error('Disbursement failed:', JSON.stringify(err, null, 2));
            loanPayout = await prisma.loanPayout.update({
              where: { id: loanPayout.id },
              data: { status: PayoutStatus.FAILED },
            });

            await prisma.auditLog.create({
              data: {
                tenant: { connect: { id: loan.tenantId } },
                user: { connect: { id: userId } },
                action: 'DISBURSEMENT_FAILED',
                resource: 'LOAN',
                details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: (err as Error).message }),
              },
            });

            const tenant = await prisma.tenant.findUnique({
              where: { id: loan.tenantId },
              select: { name: true },
            });

            await sendSMS(
              loan.tenantId,
              loan.user.phoneNumber,
              `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to an error.`
            ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));

            // res.status(400).json({
            //   success: false,
            //   message: 'Loan approved but disbursement failed',
            //   data: { loan: updatedLoan, loanPayout: { message: 'Payout created but failed', payout: loanPayout } },
            // });
            // return;
          }
        }
      } else {
        res.status(400).json({
          success: false,
          message: 'Invalid approval count',
          error: 'Invalid approval count',
        });
        return;
      }
    } else {
      res.status(500).json({
        success: false,
        message: 'Invalid organization approval steps',
        error: 'Invalid organization approval steps',
      });
      return;
    }

    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: userId } },
        action: 'APPROVE',
        resource: 'LOAN',
        details: JSON.stringify({
          loanId: loan.id,
          approvalCount: updatedLoan!.approvalCount,
          message: `Loan ${id} approved by ${firstName} ${lastName} (Approval ${updatedLoan!.approvalCount}/${loan.organization.approvalSteps})`,
        }),
      },
    });

    if (updatedLoan!.status === 'APPROVED') {
      const tenant = await prisma.tenant.findUnique({
        where: { id: loan.tenantId },
        select: { name: true },
      });

      await sendSMS(
        loan.tenantId,
        loan.user.phoneNumber,
        `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} has been approved. Disbursement initiated. Contact support for queries.`
      ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));
    }

    const response: ApiResponse<{
      loan: Loan;
      loanPayout?: LoanPayout | { message: string; payout: LoanPayout };
      disbursement?: DisbursementResult;
    }> = {
      success: true,
      message:
        loan.organization.approvalSteps === 1 || updatedLoan!.approvalCount === 2
          ? 'Loan fully approved and disbursement initiated'
          : 'Loan partially approved (pending second approval)',
      data: { loan: updatedLoan! },
    };

    if (loanPayout) {
      response.data!.loanPayout = loanPayout;
    }
    if (disbursementResult) {
      response.data!.disbursement = disbursementResult;
    }
    res.status(200).json(response);
  } catch (error: unknown) {
    console.error('Error approving loan:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: (error as Error).message,
    });
  } 
};




export const rejectLoan = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Loan> | ErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const { id } = req.params;
  const { id: userId, tenantId, role, firstName, lastName } = req.user!;

  try {
    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Loan ID is required',
        error: 'Loan ID is required',
      });
      return;
    }

    if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
      res.status(403).json({
        success: false,
        message: 'Only ORG_ADMIN or ADMIN can reject loans',
        error: 'Forbidden',
      });
      return;
    }

    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: { organization: { select: { id: true, approvalSteps: true, name: true, loanLimitMultiplier: true } } },
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        message: 'Loan not found',
        error: 'Loan not found',
      });
      return;
    }

    if (loan.status !== 'PENDING') {
      res.status(400).json({
        success: false,
        message: `Loan is not in PENDING status, current status: ${loan.status}`,
        error: 'Invalid loan status',
      });
      return;
    }

    if (role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: userId }, // Fixed: Removed tenantId condition
        select: { organizationId: true },
      });
      if (!employee || loan.organizationId !== employee.organizationId) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to reject this loan',
          error: 'Forbidden',
        });
        return;
      }
    } else if (role.includes('ADMIN') && loan.tenantId !== tenantId) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized to reject this loan',
        error: 'Forbidden',
      });
      return;
    }

    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED' },
      include: { organization: { select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true ,interestRate:true} }, 
    consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
        },
    });

    if (!updatedLoan) {
      res.status(500).json({
        success: false,
        message: 'Failed to update loan',
        error: 'Loan not found after update',
      });
      return;
    }

    // Verify loan limit reversal (recompute takenSoFar to confirm)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { _sum } = await prisma.loan.aggregate({
      _sum: { amount: true },
      where: {
        userId: loan.userId,
        tenantId,
        status: { in: ['PENDING', 'APPROVED'] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });

    const takenSoFar = _sum.amount ?? 0;

    // Log audit for rejection
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: userId } },
        action: 'REJECT',
        resource: 'LOAN',
        details: JSON.stringify({
          loanId: id,
          message: `Loan ${id} rejected by ${firstName} ${lastName}`,
          takenSoFarAfterRejection: takenSoFar,
        }),
      },
    });

    // Send SMS notification to user
    const user = await prisma.user.findUnique({
      where: { id: loan.userId },
      select: { firstName: true, phoneNumber: true },
    });
    const tenant = await prisma.tenant.findUnique({
      where: { id: loan.tenantId },
      select: { name: true },
    });

    if (user) {
      await sendSMS(
        loan.tenantId,
        user.phoneNumber,
        `Dear ${user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} has been rejected. Contact support for details.`
      ).catch((e: Error) => console.error(`SMS failed: ${e.message}`));
    }

    res.status(200).json({
      success: true,
      message: 'Loan rejected successfully',
      data: updatedLoan,
    });
  } catch (error: unknown) {
    console.error('Error rejecting loan:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: (error as Error).message,
    });
  } finally {
    await prisma.$disconnect();
  }
};



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

    // Normalize phone number for M-Pesa
    const phoneNumber: string = loan.user.phoneNumber.startsWith('+254')
      ? loan.user.phoneNumber.replace('+', '')
      : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

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






// Get pending loan requests
export const getPendingLoanRequests = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Loan[]> | ErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const { tenantId } = req.user!;

  try {
    if (!tenantId) {
       res.status(400).json({ message: 'Tenant ID is required' });
      return;
    }

    const loans = await prisma.loan.findMany({
      where: { tenantId, status: 'PENDING' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true,} },
        organization: { select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true, interestRate: true } },
        consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
        LoanPayout: true,
       
      },
      orderBy: { createdAt: 'desc' },
    });

     res.status(200).json({
      success: true,
      error: null,
      message: loans.length === 0 ? 'No pending loans found' : 'Pending loans retrieved successfully',
      data: loans,
      
    });
  } catch (error: unknown) {
    console.error('Error fetching pending loan requests:', error);
   res.status(500).json({ message: 'Failed to fetch pending loan requests', error: (error as Error).message });
   return;
  } finally {
    await prisma.$disconnect();
  }
};




export const getLoansGroupedByStatus = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Record<LoanStatus, Loan[]>> | ErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const { tenantId } = req.user!;

  if (!tenantId) {
    res.status(400).json({ message: 'Tenant ID is required' });
    return;
  }

  try {
    const statuses: LoanStatus[] = ['PENDING', 'APPROVED', 'DISBURSED', 'REJECTED'];

    const loanResults = await Promise.all(
      statuses.map((status) =>
        prisma.loan.findMany({
          where: { tenantId, status },
          include: {
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
                approvalSteps: true,
                loanLimitMultiplier: true,
                interestRate: true,
              },
            },
            consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
            LoanPayout: true,
          },
          
          orderBy: { createdAt: 'desc' },
        })
      )
    );

    const groupedLoans: Record<LoanStatus, Loan[]> = statuses.reduce((acc, status, index) => {
      acc[status] = loanResults[index];
      return acc;
    }, {} as Record<LoanStatus, Loan[]>);

    res.status(200).json({
      message: 'Loans grouped by status retrieved successfully',
      data: groupedLoans,
    });
  } catch (error: unknown) {
    console.error('Error fetching grouped loans:', error);
    res.status(500).json({
      message: 'Failed to fetch loans grouped by status',
      error: (error as Error).message,
    });
  }
};


export const getPendingLoans = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<UnpaidLoan[]> | ErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const { role, tenantId } = req.user!;

  try {
    // Validate tenantId
    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required' });
      return;
    }

    // Restrict access to ADMIN role
    if (!role.includes('ADMIN')) {
      res.status(403).json({ message: 'Access denied. Admin role required.' });
      return;
    }

    // Fetch pending loans
    const loans = await prisma.loan.findMany({
      where: {
        status: 'PENDING',
        tenantId,
      },
      include: {
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
            approvalSteps: true,
            loanLimitMultiplier: true,
            interestRate: true,
          },
        },
       
       
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      message: 'Pending loans retrieved successfully',
      data: loans,
    });
  } catch (error: unknown) {
    console.error('Error fetching pending loans:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: (error as Error).message,
    });
  }
  // No need for finally block unless in a serverless environment
};


// Get user loans




export const getUserLoans = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Record<string, Loan[]>> | ErrorResponse>,
): Promise<void> => {
  const { id: userId } = req.user!;
type LoanWithOrg = Loan & { organization: Organization };
  try {
    const loans = await prisma.loan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true,
        consolidatedRepayment: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            tenantId: true,
            amount: true,
            totalAmount: true,
            paidAt: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }) as LoanWithOrg[];

    const grouped = {
      pending: loans.filter((loan) => loan.status === 'PENDING' || loan.status === 'APPROVED'),
      disbursed: loans.filter((loan) => loan.status === 'DISBURSED'),
      rejected: loans.filter((loan) => loan.status === 'REJECTED'),
    };

    res.status(200).json({ message: 'User loans retrieved successfully', data: grouped });
  } catch (error: unknown) {
    console.error('Error fetching user loans:', error);
    res.status(500).json({ message: 'Could not retrieve loans', error: (error as Error).message });
  }
};




export const getCurrentMonthLoanStats = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<{ totalBorrowed: number; totalPending: number; totalDisbursed: number; totalAmountBorrowed: number }> | ErrorResponse>,
 
): Promise<void> => {
  const { role, tenantId, organizationId } = req.user!;

  try {
    // Validate tenantId
    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Restrict access to ADMIN or ORG_ADMIN roles
    if (!role.includes('ADMIN') && !role.includes('ORG_ADMIN')) {
      res.status(403).json({ message: 'Access denied. Admin or Org Admin role required.' });
    }

    // Validate organizationId for ORG_ADMIN
    if (role.includes('ORG_ADMIN') && !organizationId) {
     res.status(400).json({ message: 'Organization context missing' });
    }

    // Set date range for current month (Africa/Nairobi timezone)
    const now = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const start = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);
    const end = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 1);

    // Base filter (exclude organizationId for ADMIN users)
    const baseFilter: { tenantId: number; createdAt: { gte: Date; lt: Date }; organizationId?: number } = {
      tenantId,
      createdAt: { gte: start, lt: end },
    };
    if (role.includes('ORG_ADMIN')) {
      baseFilter.organizationId = organizationId!;
    }

    // Fetch stats in a transaction
    const [totalBorrowed, totalPending, totalDisbursed, { _sum }] = await prisma.$transaction([
      prisma.loan.count({ where: baseFilter }),
      prisma.loan.count({ where: { ...baseFilter, status: 'PENDING' } }),
      prisma.loan.count({ where: { ...baseFilter, status: 'DISBURSED' } }),
      prisma.loan.aggregate({ _sum: { amount: true }, where: baseFilter }),
    ]);

    // Log for debugging
    console.log(`Loan stats for tenantId ${tenantId}${role.includes('ORG_ADMIN') ? `, organizationId ${organizationId}` : ''}:`, {
      totalBorrowed,
      totalPending,
      totalDisbursed,
      totalAmountBorrowed: _sum.amount || 0,
    });

     res.status(200).json({
      message: 'Current month loan stats retrieved successfully',
      data: {
        totalBorrowed,
        totalPending,
        totalDisbursed,
        totalAmountBorrowed: _sum.amount || 0,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching current-month loan stats:', error);
     res.status(500).json({
      message: 'Internal server error',
      error: (error as Error).message,
    });
  }
};




export const getLoansForAll = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Loan[]> | ErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const { role, tenantId, organizationId } = req.user!;

  try {
    // Validate tenantId
    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Check tenant status
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
     res.status(403).json({
        message: 'Feature disabled due to non-payment of the service',
      });
    }

    // Restrict access to ADMIN or ORG_ADMIN roles
    if (!role.includes('ADMIN') && !role.includes('ORG_ADMIN')) {
     res.status(403).json({ message: 'Access denied. Admin or Org Admin role required.' });
    }

    // Validate organizationId for ORG_ADMIN
    if (role.includes('ORG_ADMIN') && !organizationId) {
     res.status(400).json({ message: 'Organization context missing' });
    }

    // Build filter
    const baseFilter: { tenantId: number; organizationId?: number } = { tenantId };
    if (role.includes('ORG_ADMIN')) {
      baseFilter.organizationId = organizationId!;
    }

    // Fetch all loans
 
const loans = await prisma.loan.findMany({
  where: baseFilter,
  include: {
    user: true,
    organization: true,
    consolidatedRepayment: {
            select: {
              id: true,

              userId: true,
  organizationId: true,
  tenantId: true,
  amount: true,
  totalAmount: true,
  paidAt: true,
  status: true,
  createdAt: true,
  updatedAt: true
              
            },
          },
    LoanPayout: true,
  },
  orderBy: { createdAt: 'desc' },
});


    // Log for debugging
    console.log(`Fetched ${loans.length} loans for tenantId ${tenantId}${role.includes('ORG_ADMIN') ? `, organizationId ${organizationId}` : ''}`);

  res.status(200).json({
      message: 'All loans retrieved successfully',
      data: loans || [],
      success: true,
      error: null
    });
  } catch (error: unknown) {
    console.error('Error fetching all loans:', error);
  
   res.status(500).json({
      message: 'Internal server error',
      error: (error as Error).message,
    });
  }
};