import { Request, Response, NextFunction } from 'express';
import { PrismaClient, LoanStatus, PayoutStatus, TenantStatus, InterestRateType } from '@prisma/client';
import ROLE_PERMISSIONS from '../../DatabaseConfig/role';
import { disburseB2CPayment } from '../mpesa/initiateB2CPayment';
import { sendSMS } from '../sms/sms';
import { fetchLatestBalance } from '../mpesa/mpesaConfig';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { ApiResponse,DisbursementResult, ErrorResponse, GetLoans, Loan, LoanbyId, LoanDetails, LoanPayout, Organization, UnpaidLoan} from '../../types/loans/loan';
import { startOfMonth } from 'date-fns';

const prisma = new PrismaClient();




// Helper Functions

export const calculateLoanDetails = (
  amount: number,
  interestRate: number,
  interestRateType: 'DAILY' | 'MONTHLY' = 'MONTHLY',
  loanDurationDays = 30,
  baseInterestRate?: number,
  dailyInterestRate?: number
): LoanDetails & { appliedInterestRate: number; loanDurationDays: number } => {
  if (!amount || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid loan amount');
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + loanDurationDays);

 console.log(`dueDate: ${dueDate}, totalRepayable: ${amount * (1 + interestRate)}, appliedInterestRate: ${interestRate}, loanDurationDays: ${loanDurationDays}`);
  let totalRepayable: number;
  let appliedInterestRate: number;

  if (interestRateType === InterestRateType.DAILY) {
    if (!dailyInterestRate || isNaN(dailyInterestRate) || dailyInterestRate <= 0) {
      throw new Error('Invalid daily interest rate');
    }

    const calculatedInterest = dailyInterestRate * loanDurationDays;
    appliedInterestRate =
      baseInterestRate && calculatedInterest < baseInterestRate
        ? baseInterestRate
        : calculatedInterest;

    totalRepayable = amount * (1 + appliedInterestRate);
  } else {
    appliedInterestRate = interestRate;
    totalRepayable = amount * (1 + appliedInterestRate);
  }

  if (isNaN(totalRepayable)) {
    throw new Error('Failed to calculate total repayable');
  }

  return { dueDate, totalRepayable, appliedInterestRate, loanDurationDays };
};


;




type MinimalLoan = {
  id: number;
  amount: number;
  tenantId: number;
  disbursedAt: Date | null;
  user: { id: number; firstName: string; phoneNumber: string , lastName: string};
  organization: { id: number; name: string };
};





export const getLoans = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<GetLoans[]> | ErrorResponse>,

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

   res.status(200).json({ message: 'Loans retrieved successfully' });
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
        user:true,
        organization:true,
        consolidatedRepayment:true
      
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
        user: { connect: { id:  userId} },
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








// Get pending loan requests
export const getPendingLoanRequests = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<Loan[]> | ErrorResponse>,

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
    user: true,
    organization: true,
    consolidatedRepayment: true,
  },
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



// export const getLoansGroupedByStatus = async (
//   req: AuthenticatedRequest,
//   res: Response<ApiResponse<LoanStatus, Loan[]> | ErrorResponse>,
//   next: NextFunction
// ): Promise<void> => {
//   const { tenantId } = req.user!;

//   if (!tenantId) {
//     res.status(400).json({ message: 'Tenant ID is required' });
//     return;
//   }

//   try {
//     const statuses: LoanStatus[] = ['PENDING', 'APPROVED', 'DISBURSED', 'REJECTED'];

//     const loanResults = await Promise.all(
//       statuses.map((status) =>
//         prisma.loan.findMany({
//           where: { tenantId, status },
//           select: {
//             user: true,
//             organization: true,
//             consolidatedRepayment: true,
//             LoanPayout: true,
//           },
//           orderBy: { createdAt: 'desc' },
//         })
//       )
//     );

//     if (loanResults.length > 0) {



//   const loanStatuses = await prisma.loan.findMany({
//   select: {
//     status: true,
//   },
//   distinct: ['status'],
// });



// const groupedLoans: Record<string, Loan[]> = Object.fromEntries(
//   loanStatuses.map((status) => [status.status, []])
// );


 

//       res.status(200).json({
//         message: 'Loans grouped by status retrieved successfully',
//         data: groupedLoans,
//       });
//     } else {
//       res.status(200).json({
//         message: 'No loans found',
//         data: groupedLoans,

        
//       });
//     }
//   } catch (error: unknown) {
//     console.error('Error fetching grouped loans:', error);
//     res.status(500).json({
//       message: 'Failed to fetch loans grouped by status',
//       error: (error as Error).message,
//     });
//   }
// };


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
  include: {
    user: true,
    organization: true,
    consolidatedRepayment: {
      select: {
        id: true,
        organizationId: true,
        tenantId: true,

       
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





export const getAllLoansWithDetails = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { tenantId } = req.user!;

  try {
    const loans = await prisma.loan.findMany({
      where: { tenantId }, // 🔐 Multi-tenant filter
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true,
            employee: {
              select: {
                id: true,
                jobId: true,
                organization: {
                  select: { id: true, name: true }
                }
              }
            }
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        consolidatedRepayment: {
          select: {
            id: true,
           
            paidAt: true,
            status: true,
          },
        },
        LoanPayout: {
          select: {
            id: true,
            amount: true,
            status: true,
            transactionId: true,
            method: true,
            createdAt: true,
          },
        },
      },
    });

    res.status(200).json({
      message: 'Loans retrieved successfully',
      loans,
    });
  } catch (error: any) {
    console.error('Failed to fetch loans:', error.message);
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
};








export const getLoansByOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { tenantId } = req.user!;
  const { orgId:organizationId } = req.params

  if (!organizationId) {
    res.status(400).json({ error: 'Missing organizationId' });
    return;
  }

  const orgId = parseInt(organizationId as string, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'Invalid organizationId' });
    return;
  }

  try {
    const now = new Date();
    const monthStart = startOfMonth(now);

    // 1. All loans for this organization
    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        organizationId: orgId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 2. Total loans under org
    const totalLoans = await prisma.loan.count({
      where: {
        tenantId,
        organizationId: orgId,
      },
    });

    // 3. Total loans this month
    const loansThisMonth = await prisma.loan.count({
      where: {
        tenantId,
        organizationId: orgId,
        createdAt: {
          gte: monthStart,
        },
      },
    });

    // 4. Count per status this month
    const statuses: LoanStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'REPAID', 'DISBURSED'];
    const statusCountsThisMonth: Record<LoanStatus, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      REPAID: 0,
      DISBURSED: 0,
    };

    await Promise.all(
      statuses.map(async (status) => {
        const count = await prisma.loan.count({
          where: {
            tenantId,
            organizationId: orgId,
            createdAt: {
              gte: monthStart,
            },
            status,
          },
        });
        statusCountsThisMonth[status] = count;
      })
    );

    const disbursed = statusCountsThisMonth.DISBURSED;
    const disbursedPercentageThisMonth =
      loansThisMonth > 0 ? (disbursed / loansThisMonth) * 100 : 0;

    res.status(200).json({
      loans,
      stats: {
        totalLoans,
        loansThisMonth,
        statusCountsThisMonth,
        disbursedPercentageThisMonth: parseFloat(disbursedPercentageThisMonth.toFixed(2)),
      },
    });
  } catch (error: any) {
    console.error('Error fetching loans by organization:', error.message);
    res.status(500).json({ error: 'Failed to fetch organization loans' });
  }
};





export const getLoansByStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { tenantId } = req.user!;
  const statusParam = req.query.status as LoanStatus;

  try {
    if (!statusParam || !Object.values(LoanStatus).includes(statusParam)) {
       res.status(400).json({ error: 'Invalid or missing loan status' });
       return;
    }

    const loans = await prisma.loan.findMany({
      where: {
        status: statusParam,
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({ loans });
  } catch (error: any) {
    console.error('Error fetching loans by status:', error.message);
    res.status(500).json({ error: 'Failed to fetch loans by status' });
  }
};

