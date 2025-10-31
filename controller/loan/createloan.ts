import { Request, Response } from 'express';
import { PrismaClient, LoanStatus, PayoutStatus,InterestRateType, LoanType} from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { AutoApprovalResponse, ErrorResponse,ApiResponse, MinimalLoanForDisbursement, LoanPayout, DisbursementResult } from '../../types/loans/loan';
import { calculateLoanDetails } from './getloans';
import { sendSMS } from '../sms/sms';
import { fetchLatestBalance } from '../mpesa/mpesaConfig';
import { disburseB2CPayment } from '../mpesa/initiateB2CPayment';


const prisma = new PrismaClient();



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
       
        Organization: {
            select: {
              id: true,
              name: true,
              status: true,
              loanLimitMultiplier: true,
              interestRate: true,
              interestRateType: true,
              dailyInterestRate: true,
              baseInterestRate: true,
              approvalSteps: true,
              
            }
          }
        }
      ,
    });
if (!employee || !employee?.Organization) {
  res.status(400).json({ message: 'Employee or organization not found' });
  return;
}

if (employee.Organization?.status !== 'ACTIVE') {
  res.status(403).json({ message: 'Loan requests are disabled. Your organization is not active.' });


  return;
}


    const org = employee.Organization;
    const monthlyCap = employee.grossSalary * org.loanLimitMultiplier;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

// Determine loan type and applicable interest rate based on org config
const theloanType: LoanType = org.interestRateType === 'DAILY' ? 'DAILY' : 'MONTHLY';
const interestRateToApply =
  theloanType === 'DAILY' ? org.dailyInterestRate : org.interestRate;


    const { _sum } = await prisma.loan.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        tenantId,
        status: { in: ['DISBURSED'] },
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

    const today = new Date();
const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0); // last day of this month
const loanDurationDays = Math.ceil(
  (endOfMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
);

  const {
  dueDate,
  totalRepayable,
  appliedInterestRate
} = await calculateLoanDetails(
      
  amount,
  interestRateToApply,
  theloanType,        // DAILY or MONTHLY
  loanDurationDays,   // optional param
  org.baseInterestRate,
  org.dailyInterestRate
);



const transactionBand = await prisma.transactionCostBand.findFirst({
  where: {
    tenantId,
    minAmount: { lte: amount },
    maxAmount: { gte: amount },
  },
});

const transactionCharge = transactionBand?.cost ?? 0;




    const loan = await prisma.loan.create({
      data: {
        User: { connect: { id: userId } },
        Organization: { connect: { id: org.id } },
        Tenant: { connect: { id: tenantId } },
        amount,
        interestRate: appliedInterestRate,
        dueDate,
        totalRepayable,
        transactionCharge,
        status: org.approvalSteps === 0 ? 'APPROVED' : 'PENDING',
        approvalCount: 0,
        loanType:theloanType,
        updatedAt: new Date(),
      },
      include: {
        Organization: { select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true, interestRate: true , interestRateType: true, baseInterestRate: true, dailyInterestRate: true} },
        User: { select: { id: true, firstName: true, phoneNumber: true, lastName: true } },
        ConsolidatedRepayment: true,
        LoanPayout: true,
      },
    });

    console.log(`this is the loan ${JSON.stringify(loan)}`);

    await prisma.auditLog.create({
      data: {
        Tenant: { connect: { id: tenantId } },
        User: { connect: { id: userId } },
        action: 'CREATE',
        resource: 'LOAN',
        details: JSON.stringify({ loanId: loan.id, amount }),
        
      },
    });

    // === Auto Approval & Disbursement ===
    if (org.approvalSteps === 0) {
      const disbursableLoan : MinimalLoanForDisbursement= {
        id: loan.id,
        amount: loan.amount,
        tenantId: loan.tenantId,
        disbursedAt: loan.disbursedAt,
        user: {
          id: loan.User.id,
          firstName: loan.User.firstName,
          phoneNumber: loan.User.phoneNumber,
          lastName: loan.User.lastName
        },
        organization: {
          id: loan.Organization.id,
          name: loan.Organization.name,
          approvalSteps: loan.Organization.approvalSteps,
          loanLimitMultiplier: loan.Organization.loanLimitMultiplier,
          interestRate: loan.Organization.interestRate

          
        },
      };

      const { loanPayout, disbursement, updatedLoan } = await createPayoutAndDisburse(disbursableLoan, prisma);

      if ('message' in loanPayout) {
        res.status(400).json({
          success: false,
          message: 'Loan auto-approved but disbursement failed',
          data: {
            loan: {
              ...loan,
              user: loan.User,
              organization: loan.Organization,
              consolidatedRepayment: loan.ConsolidatedRepayment,
            },
            loanPayout,
            disbursement: null
          },
          error: 'Disbursement failed'
        });
        return;
      }

      await prisma.auditLog.create({
        data: {
          Tenant: { connect: { id: tenantId } },
          User: { connect: { id: userId } },
          action: 'AUTO_APPROVE',
          resource: 'LOAN',
          details: JSON.stringify({
            loanId: loan.id,
            message: `Loan ${loan.id} auto-approved (0 approval steps required)`,
          }),
        },
      });

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });

    let interestDescription = '';
          if (org.interestRateType === 'DAILY') {
             interestDescription = `At a daily rate Interest of: ${(interestRateToApply * 100).toFixed(2)}% per day`;
               } else {
  interestDescription = `Interest: ${(appliedInterestRate * 100).toFixed(2)}% monthly`;
          }

               const dueDateFormatted = dueDate.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      //const totalRepayable = amount * (1 + appliedInterestRate) + transactionCharge; 

      const message = `Dear ${firstName}, your loan of KES ${amount.toLocaleString()} at ${tenant?.name ??''} has been auto-approved. ${interestDescription}.SMS and Transaction charges is ${loan.transactionCharge.toLocaleString()} Due date: ${dueDateFormatted}. Total Repayable: ${loan.totalRepayable.toLocaleString()}.`;

        await sendSMS(tenantId, phoneNumber, message).catch(err =>
  console.error('SMS error:', err)
        );


    

      res.status(201).json({
        message: 'Loan auto-approved and disbursement initiated',
        success: true,
        data: {
          loan: {
            ...loan,
            user: loan.User,
            organization: loan.Organization,
            consolidatedRepayment: loan.ConsolidatedRepayment,
          },
          loanPayout,
          disbursement
        },
        error: null
      });
      return;
    }

    // === Manual Approval Notifications ===
    const applicantName = `${firstName} ${lastName}`;
    // const orgAdmins = await prisma.user.findMany({
    //   where: { tenantId, organizationId: org.id, role: { has: 'ORG_ADMIN' }, status: 'ACTIVE' },
    //   select: { id: true, firstName: true, lastName: true, phoneNumber: true },
    // });
const [orgAdmins, platformAdmins] = await Promise.all([
  prisma.user.findMany({
    where: {
      tenantId,
      organizationId: org.id,
      role: { has: 'ORG_ADMIN' },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
    },
  }),
  prisma.user.findMany({
    where: {
      tenantId,
      role: { has: 'ADMIN' },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
    },
  }),
]);

// Merge and deduplicate by user ID
const notifyUsers = [...orgAdmins, ...platformAdmins].filter(
  (user, index, self) =>
    index === self.findIndex((u) => u.id === user.id)
);


    await Promise.all(
      notifyUsers.map((admin) =>
        sendSMS(
          tenantId,
          admin.phoneNumber,
          `Hello ${admin.firstName}, new loan request #${loan.id} for KES ${amount} by ${applicantName}. Please review.`
        ).catch(err => console.error(`Failed to send SMS to ${admin.phoneNumber}:`, err))
      )
    );

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    await sendSMS(
      tenantId,
      phoneNumber,
      `Dear ${firstName}, your KES ${amount} loan at ${tenant?.name ?? 'the organization'} is pending approval.`
    ).catch(err => console.error(`Failed to send SMS to ${phoneNumber}:`, err));

    res.status(201).json({
      message: 'Loan created and pending approval',
      success: true,
      data: {
        loan: {
          ...loan,
          user: loan.User,
          organization: loan.Organization,
          consolidatedRepayment: loan.ConsolidatedRepayment,
        },
        loanPayout: null,
        disbursement: null
      },
      error: null
    });
  } catch (error: unknown) {
    console.error('Error creating loan:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};


const createPayoutAndDisburse = async (
    loan: MinimalLoanForDisbursement,
  prisma: PrismaClient
): Promise<{
  loanPayout: LoanPayout | { message: string; payout: LoanPayout };
  disbursement?: DisbursementResult;
   updatedLoan: MinimalLoanForDisbursement | null;
}> => {
  let loanPayout: LoanPayout | null = null;
  let disbursementResult: DisbursementResult | undefined;
  let updatedLoan: typeof loan | null = null;

  loanPayout = await prisma.loanPayout.create({
    data: {
      loanId: loan.id,
      amount: loan.amount,
      method: 'MPESA',
      status: PayoutStatus.PENDING,
      approvedById: null,
      tenantId: loan.tenantId,
      transactionId: null,
      updatedAt: new Date(),
    },
  });

  if (!loan.disbursedAt) {
    const balanceRecord = await fetchLatestBalance(loan.tenantId);
    const availableBalance = balanceRecord?.utilityAccountBalance ?? 0;

    if (availableBalance < loan.amount) {
      await prisma.loanPayout.update({
        where: { id: loanPayout.id },
        data: { status: PayoutStatus.FAILED },
      });

      await prisma.auditLog.create({
        data: {
          Tenant: { connect: { id: loan.tenantId } },
          User: { connect: { id: loan.user.id } },
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
      ).catch(err => console.error('SMS error:', err));

      return {
        loanPayout: { message: 'Payout created but failed due to insufficient balance', payout: loanPayout },
        disbursement: undefined,
        updatedLoan,
      };
    }

    try {
      const formattedPhone = loan.user.phoneNumber.startsWith('+254')
        ? loan.user.phoneNumber.replace('+', '')
        : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

      disbursementResult = await disburseB2CPayment({
        phoneNumber: formattedPhone,
        amount: loan.amount,
        loanId: loan.id,
        userId: loan.user.id,
        tenantId: loan.tenantId,
      });

      if (!disbursementResult?.mpesaResponse) {
        throw new Error('Disbursement failed: No MPESA response');
      }

      updatedLoan = {
        ...loan,
        disbursedAt: new Date()
      };

      await prisma.loanPayout.update({
        where: { id: loanPayout.id },
        data: {
          transactionId: disbursementResult.mpesaResponse.transactionId,
          status: PayoutStatus.DISBURSED,
        },
      });
    } catch (err) {
      await prisma.loanPayout.update({
        where: { id: loanPayout.id },
        data: { status: PayoutStatus.FAILED },
      });

      await prisma.auditLog.create({
        data: {
          Tenant: { connect: { id: loan.tenantId } },
          User: { connect: { id: loan.user.id } },
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
      ).catch(e => console.error('SMS failed:', e));

      return {
        loanPayout: { message: 'Payout created but failed due to error', payout: loanPayout },
        disbursement: undefined,
        updatedLoan,
      };
    }
  }

  return { loanPayout, disbursement: disbursementResult, updatedLoan };
};
