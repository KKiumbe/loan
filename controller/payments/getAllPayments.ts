// src/controllers/paymentController.ts
import { PrismaClient, LoanStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { LoanPayout, LoanPayoutSearchByName, Payment, PaymentBatch, PaymentConfirmation, PaymentConfirmationCreateNestedManyWithoutPaymentBatchInput } from '../../types/loans/loansPayments';
import { AuthenticatedRequest } from '../../middleware/verifyToken';



const prisma = new PrismaClient();



const getAllLoanPayouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user;

  if (!user?.tenantId) {
    res.status(401).json({ message: 'Unauthorized. Tenant not found in session.' });
    return;
  }

  try {
    

const rawPayouts = await prisma.loanPayout.findMany({
  where: {
    tenantId: user.tenantId,
  },
  orderBy: {
    createdAt: 'desc',
  },
  include: {
    Loan: {
      select: {
        id: true,
        amount: true,
        interestRate: true,
        status: true,
        createdAt: true,
        disbursedAt: true,
        tenantId: true,
        userId: true,
        User: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        Organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    User: {
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
      }
    },
    PaymentConfirmation: {
      include: {
        PaymentBatch: {
          select: {
            id: true,
            reference: true,
            paymentMethod: true,
            totalAmount: true,
            receivedAt: true,
            remarks: true,
          },
        },
      },
    },
  },
});

const payouts: LoanPayout[] = rawPayouts.map((payout) => ({
  id: payout.id,
  loanId: payout.loanId,
  amount: payout.amount,
  method: payout.method,
  transactionId: payout.transactionId,
  status: payout.status,
  tenantId: payout.tenantId,
  createdAt: payout.createdAt,
  updatedAt: payout.updatedAt,
  loan: payout.Loan ? {
    id: payout.Loan.id,
    amount: payout.Loan.amount,
    interestRate: payout.Loan.interestRate,
    status: payout.Loan.status,
    createdAt: payout.Loan.createdAt,
    disbursedAt: payout.Loan.disbursedAt,
    tenantId: payout.Loan.tenantId,
    userId: payout.Loan.userId,
    user: payout.Loan.User,
    organization: payout.Loan.Organization,
  } : null,
  user: payout.User ? {
    firstName: payout.User.firstName,
    lastName: payout.User.lastName,
    phoneNumber: payout.User.phoneNumber,
  } : null,
  confirmation: payout.PaymentConfirmation ? {
    id: payout.PaymentConfirmation.id,
    amountSettled: payout.PaymentConfirmation.amountSettled,
    settledAt: payout.PaymentConfirmation.settledAt,
    paymentBatch: payout.PaymentConfirmation.PaymentBatch,
  } : null,
}));

res.status(200).json({ data: payouts });
  } catch (error: any) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ message: 'Failed to fetch loan payouts', error: error.message });
  }
};






const getPaymentConfirmations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const confirmations = await prisma.paymentConfirmation.findMany({
      where: {
        PaymentBatch: {
          tenantId,
        },
      },
      include: {
        PaymentBatch: {
          select: {
            id: true,
            reference: true,
            paymentMethod: true,
            remarks: true,
            receivedAt: true,
            Organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        LoanPayout: {
          select: {
            id: true,
            amount: true,
            Loan: {
              select: {
                amount: true,
                User: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const formatted = confirmations.map((c) => ({
      confirmationId: c.id,
      amountSettled: c.amountSettled,
      settledAt: c.settledAt,
      payoutId: c.LoanPayout.id,
      payoutAmount: c.LoanPayout.amount,
      loanAmount: c.LoanPayout.Loan.amount,
      firstName: c.LoanPayout.Loan.User.firstName,
      lastName: c.LoanPayout.Loan.User.lastName,
      organizationName: c.PaymentBatch.Organization.name,
      paymentMethod: c.PaymentBatch.paymentMethod,
      reference: c.PaymentBatch.reference,
      receivedAt: c.PaymentBatch.receivedAt,
      remarks: c.PaymentBatch.remarks,
    }));

    res.status(200).json({ confirmations: formatted });
  } catch (error: any) {
    console.error('Error fetching confirmations:', error);
    res.status(500).json({ message: 'Failed to fetch payment confirmations.' });
  }
};

const getPaymentBatches = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { tenantId } = req.user || {};
    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID missing' });
      return;
    }

    // Optional: support pagination via ?page=1&limit=20
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [batches, total] = await Promise.all([
      prisma.paymentBatch.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        include: {
          Organization: { select: { id: true, name: true } },
          PaymentConfirmation: { select: { id: true } },
        },
      }),
      prisma.paymentBatch.count({ where: { tenantId } }),
    ]);

    // Format response
    const formatted = batches.map((b) => ({
      id: b.id,
      organizationName: b.Organization.name,
      totalAmount: b.totalAmount,
      paymentMethod: b.paymentMethod,
      reference: b.reference,
      remarks: b.remarks,
      receivedAt: b.receivedAt,
      confirmationCount: b.PaymentConfirmation.length,
    }));

    res.status(200).json({
      batches: formatted,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('Error fetching payment batches', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};



const fetchPaymentById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { paymentId } = req.params;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    res.status(401).json({ message: 'Unauthorized: Tenant ID not found' });
    return;
  }

  if (!paymentId) {
    res.status(400).json({ message: 'Payment ID is required' });
    return;
  }

  try {
    const payout = await prisma.loanPayout.findFirst({
      where: {
        id: parseInt(paymentId),
        tenantId,
      },
      include: {
        Loan: {
          select: {
            id: true,
            amount: true,
            tenantId: true,
            userId: true,
            status: true,
            interestRate: true,
            createdAt: true,
            disbursedAt: true,
           

            User: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
                
               

              },
            },
            Organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        User: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        PaymentConfirmation: {
            select: {
              id: true,
              amountSettled: true,
              settledAt: true,
              PaymentBatch: {
                select: {
                  id: true,
                  reference: true,
                  paymentMethod: true,
                  totalAmount: true,
                  receivedAt: true,
                  remarks: true,
                },
              },
            },
          },
      },
    });

    if (!payout) {
      res.status(404).json({ message: 'Payment not found' });
      return;
    }

    // Format the response to match the LoanPayout type
    const formattedPayout: LoanPayout = {
      id: payout.id,
      loanId: payout.loanId,
      amount: payout.amount,
      method: payout.method,
      transactionId: payout.transactionId,
      status: payout.status,
      tenantId: payout.tenantId,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
      loan: {
         id: payout.Loan.id,
    amount: payout.Loan.amount,
    tenantId: payout.Loan.tenantId,
    userId: payout.Loan.userId,
    status: payout.Loan.status,
    interestRate: payout.Loan.interestRate,
    createdAt: payout.Loan.createdAt,
    disbursedAt: payout.Loan.disbursedAt,

    user: {
      firstName: payout.Loan.User.firstName,
      lastName: payout.Loan.User.lastName,
      phoneNumber: payout.Loan.User.phoneNumber,
    },
        organization: {
          id: payout.Loan.Organization.id,
          name: payout.Loan.Organization.name,
        },
      },
      user: payout.User
        ? {
            firstName: payout.User.firstName,
            lastName: payout.User.lastName,
          }
        : null,
      confirmation: payout.PaymentConfirmation
        ? {
            id: payout.PaymentConfirmation.id,
            amountSettled: payout.PaymentConfirmation.amountSettled,
            settledAt: payout.PaymentConfirmation.settledAt,
            paymentBatch: {
              id: payout.PaymentConfirmation.PaymentBatch.id,
              reference: payout.PaymentConfirmation.PaymentBatch.reference,
              paymentMethod: payout.PaymentConfirmation.PaymentBatch.paymentMethod,
              totalAmount: payout.PaymentConfirmation.PaymentBatch.totalAmount,
              receivedAt: payout.PaymentConfirmation.PaymentBatch.receivedAt,
              remarks: payout.PaymentConfirmation.PaymentBatch.remarks,
            },
          }
        : null,
    };

    res.status(200).json({ payment: formattedPayout });
  } catch (error: any) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ message: 'Internal server error' });
  } 
};





const searchPaymentsByName = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, page = '1', limit = '10' } = req.query as { name?: string; page?: string; limit?: string };
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
    return;
  }
  if (!name) {
    res.status(400).json({ error: 'Name parameter is required' });
    return;
  }

  try {
    const [payouts, total]: [LoanPayout[], number] = await Promise.all([
      prisma.loanPayout.findMany({
        where: {
          tenantId,
          Loan: {
            User: {
              firstName: { contains: name, mode: 'insensitive' },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          Loan: {
            select: {
              id: true,
              amount: true,
              User: {
                select: {
                  firstName: true,
                  lastName: true,
                  phoneNumber: true,
                },
              },
              Organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          User: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          PaymentConfirmation: {
            select: {
              id: true,
              amountSettled: true,
              settledAt: true,
              PaymentBatch: {
                select: {
                  id: true,
                  reference: true,
                  paymentMethod: true,
                  totalAmount: true,
                  receivedAt: true,
                  remarks: true,
                },
              },
            },
          },
        },
      }) as any, // Temporary cast to bypass TypeScript issue; see note below
      prisma.loanPayout.count({
        where: {
          tenantId,
          Loan: {
            User: {
              firstName: { contains: name, mode: 'insensitive' },
            },
          },
        },
      }),
    ]);

    // Format the response to match the LoanPayout type

const formattedPayouts: LoanPayoutSearchByName[] = payouts.map((payout) => ({
  id: payout.id,
  loanId: payout.loanId,
  amount: payout.amount,
  method: payout.method || null,
  transactionId: payout.transactionId || null,
  status: payout.status,
  tenantId: payout.tenantId,
  createdAt: payout.createdAt,
  updatedAt: payout.updatedAt,

  loan: payout.loan
    ? {
        id: payout.loan.id,
        tenantId: payout.loan.tenantId,
        userId: payout.loan.userId,
        amount: payout.loan.amount,
        interestRate: payout.loan.interestRate,
        status: payout.loan.status,
        createdAt: payout.loan.createdAt,
        user: payout.loan.user
          ? {
              firstName: payout.loan.user.firstName,
              lastName: payout.loan.user.lastName,
              phoneNumber: payout.loan.user.phoneNumber,
            }
          : null,
        organization: payout.loan.organization
          ? {
              id: payout.loan.organization.id,
              name: payout.loan.organization.name,
            }
          : null,
        approvedBy: payout.user
          ? {
              
              firstName: payout.user.firstName,
              lastName: payout.user.lastName,
             
          }
          : null,
      }
    : null,

  user: payout.user
    ? {
        firstName: payout.user.firstName,
        lastName: payout.user.lastName,
      }
    : null,

 

  confirmation: payout.confirmation
    ? {
        id: payout.confirmation.id,
        amountSettled: payout.confirmation.amountSettled,
        settledAt: payout.confirmation.settledAt,
        paymentBatch: payout.confirmation.paymentBatch
          ? {
              id: payout.confirmation.paymentBatch.id,
              reference: payout.confirmation.paymentBatch.reference,
              paymentMethod:
                payout.confirmation.paymentBatch.paymentMethod,
              totalAmount:
                payout.confirmation.paymentBatch.totalAmount,
              receivedAt:
                payout.confirmation.paymentBatch.receivedAt,
              remarks: payout.confirmation.paymentBatch.remarks,
            }
          : null,
      }
    : null,
}));


    res.json({ payments: formattedPayouts, total });
  } catch (error: any) {
    console.error('Error searching payments by name:', error);
    res.status(500).json({ error: 'Something went wrong' });
  } finally {
    await prisma.$disconnect();
  }
};





const searchTransactionById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { transactionId } = req.query as { transactionId?: string };
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
    return;
  }
  if (!transactionId) {
    res.status(400).json({ error: 'Transaction ID parameter is required' });
    return;
  }

  try {
    const loanPayout = await prisma.loanPayout.findFirst({
      where: {
        transactionId,
        tenantId,
      },
      include: {
        Loan: {
          select: {
            id: true,
            amount: true,
            interestRate: true,
            status: true,
            createdAt: true,
            disbursedAt: true,
            tenantId: true,
            userId: true,
            
            User: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
            Organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        User: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        PaymentConfirmation: {
          select: {
            id: true,
            amountSettled: true,
            settledAt: true,
            PaymentBatch: {
              select: {
                id: true,
                reference: true,
                paymentMethod: true,
                totalAmount: true,
                receivedAt: true,
                remarks: true,
              },
            },
          },
        },
      },
    });

    if (!loanPayout) {
      res.status(404).json({ error: 'Transaction ID not found' });
      return;
    }

// Format the response to match the LoanPayout type
const formattedPayout: LoanPayout = {
  id: loanPayout.id,
  loanId: loanPayout.loanId,
  amount: loanPayout.amount,
  method: loanPayout.method,
  transactionId: loanPayout.transactionId,
  status: loanPayout.status,
  tenantId: loanPayout.tenantId,
  createdAt: loanPayout.createdAt,
  updatedAt: loanPayout.updatedAt,
  loan: {
    id: loanPayout.Loan.id,
    amount: loanPayout.Loan.amount,
    interestRate: loanPayout.Loan.interestRate,
    status: loanPayout.Loan.status,
    createdAt: loanPayout.Loan.createdAt,
    disbursedAt: loanPayout.Loan.disbursedAt,
    tenantId: loanPayout.Loan.tenantId,
    userId: loanPayout.Loan.userId,
    user: {
      firstName: loanPayout.Loan.User.firstName,
      lastName: loanPayout.Loan.User.lastName,
      phoneNumber: loanPayout.Loan.User.phoneNumber,
    },
    organization: {
      id: loanPayout.Loan.Organization.id,
      name: loanPayout.Loan.Organization.name,
    },
  },
  user: loanPayout.approvedById && loanPayout.User
    ? {
        firstName: loanPayout.User.firstName,
        lastName: loanPayout.User.lastName,
      }
    : null,
  confirmation: loanPayout.PaymentConfirmation
    ? {
        id: loanPayout.PaymentConfirmation.id,
        amountSettled: loanPayout.PaymentConfirmation.amountSettled,
        settledAt: loanPayout.PaymentConfirmation.settledAt,
        paymentBatch: {
          id: loanPayout.PaymentConfirmation.PaymentBatch.id,
          reference: loanPayout.PaymentConfirmation.PaymentBatch.reference,
          paymentMethod: loanPayout.PaymentConfirmation.PaymentBatch.paymentMethod,
          totalAmount: loanPayout.PaymentConfirmation.PaymentBatch.totalAmount,
          receivedAt: loanPayout.PaymentConfirmation.PaymentBatch.receivedAt,
          remarks: loanPayout.PaymentConfirmation.PaymentBatch.remarks,
        },
      }
    : null,
};

res.json({ transaction: formattedPayout });
  } catch (error: any) {
    console.error('Error searching transaction:', error);
    res.status(500).json({ error: 'Something went wrong' });
  } finally {
    await prisma.$disconnect();
  }
};







export const getAllC2BMpesaTransactions = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ message: "Unauthorized: Tenant ID not found." });
      return;
    }

    // ✅ Fetch all M-Pesa C2B transactions for the current tenant
    const transactions = await prisma.mPESAC2BTransactions.findMany({
      where: { tenantId },
      orderBy: { TransTime: "desc" },
      
      
    });

    res.status(200).json({
      message: "C2B Transactions fetched successfully.",
      count: transactions.length,
      transactions,
    });
  } catch (error: any) {
    console.error("❌ Error fetching C2B transactions:", error);
    res.status(500).json({
      message: "Error fetching M-Pesa C2B transactions.",
      error: error.message,
    });
  }
};


export const searchC2BMpesaTransactions = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ message: "Unauthorized: Tenant ID not found." });
      return;
    }

    const { query = "", page = "1", pageSize = "10" } = req.query;

    // Convert page and pageSize to integers, with defaults
    const pageNum = parseInt(page as string, 10) || 1;
    const size = parseInt(pageSize as string, 10) || 10;
    const skip = (pageNum - 1) * size;

    // Build Prisma where clause for case-insensitive search
    const where = {
      tenantId,
      ...(query
        ? {
            OR: [
              { FirstName: { contains: query as string, mode: 'insensitive' as const } },
              { TransID: { contains: query as string, mode: 'insensitive' as const } },
              { BillRefNumber: { contains: query as string, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    // Fetch transactions with pagination
    const transactions = await prisma.mPESAC2BTransactions.findMany({
      where,
      skip,
      take: size,
      orderBy: { TransTime: "desc" },
      include: {
        MPESAConfig: { select: { b2cShortCode: true } },
        Tenant: { select: { id: true } },
      },
    });

    // Get total count for pagination
    const totalCount = await prisma.mPESAC2BTransactions.count({ where });

    res.status(200).json({
      message: "C2B Transactions fetched successfully.",
      count: totalCount,
      transactions,
    });
  } catch (error: any) {
    console.error("❌ Error fetching C2B transactions:", error);
    res.status(500).json({
      message: "Error fetching M-Pesa C2B transactions.",
      error: error.message,
    });
  }
};



export {
  getAllLoanPayouts,
 
  getPaymentConfirmations,
  getPaymentBatches,
  fetchPaymentById,
  searchPaymentsByName,
  searchTransactionById,

  
};