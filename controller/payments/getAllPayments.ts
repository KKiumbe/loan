// src/controllers/paymentController.ts
import { PrismaClient, LoanStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { LoanPayout, Payment, PaymentBatch, PaymentConfirmation, PaymentConfirmationCreateNestedManyWithoutPaymentBatchInput } from '../../types/loans/loansPayments';
import { AuthenticatedRequest } from '../../middleware/verifyToken';



const prisma = new PrismaClient();



const getAllLoanPayouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user;

  if (!user?.tenantId) {
    res.status(401).json({ message: 'Unauthorized. Tenant not found in session.' });
    return;
  }

  try {
    

const payouts: LoanPayout[] = await prisma.loanPayout.findMany({
  where: {
    tenantId: user.tenantId,
  },
  orderBy: {
    createdAt: 'desc',
  },
  include: {
    loan: {
      select: {
        id: true,
        amount: true,
        interestRate: true,
        status: true,
        createdAt: true,
        disbursedAt: true,
        tenantId: true,
        userId: true,
        user: {
          select: {
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
    approvedBy: {
      select: {
        firstName: true,
        lastName: true,
      },
    },
    confirmation: {
      include: {
        paymentBatch: {
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
    const confirmations: PaymentConfirmation[] = await prisma.paymentConfirmation.findMany({
      where: {
        paymentBatch: {
          tenantId,
        },
      },
      include: {
        paymentBatch: {
          select: {
            id: true,
            reference: true,
            paymentMethod: true,
            remarks: true,
            receivedAt: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        loanPayout: {
          select: {
            id: true,
            amount: true,
            loan: {
              select: {
                amount: true,
                user: {
                  select: {
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
      payoutId: c.loanPayout.id,
      payoutAmount: c.loanPayout.amount,
      loanAmount: c.loanPayout.loan.amount,
      firstName: c.loanPayout.loan.user.firstName,
      lastName: c.loanPayout.loan.user.lastName,
      organizationName: c.paymentBatch.organization.name,
      paymentMethod: c.paymentBatch.paymentMethod,
      reference: c.paymentBatch.reference,
      receivedAt: c.paymentBatch.receivedAt,
      remarks: c.paymentBatch.remarks,
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

    const [batches, total]: [PaymentBatch[], number] = await Promise.all([
      prisma.paymentBatch.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true } },
          confirmations: { select: { id: true } },
        },
      }),
      prisma.paymentBatch.count({ where: { tenantId } }),
    ]);

    // Format response
    const formatted = batches.map((b) => ({
      id: b.id,
      organizationName: b.organization.name,
      totalAmount: b.totalAmount,
      paymentMethod: b.paymentMethod,
      reference: b.reference,
      remarks: b.remarks,
      receivedAt: b.receivedAt,
      confirmationCount: b.confirmations.length,
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
        loan: {
          select: {
            id: true,
            amount: true,
            tenantId: true,
            userId: true,
            status: true,
            interestRate: true,
            createdAt: true,
            disbursedAt: true,
           

            user: {
              select: {
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
        approvedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        confirmation: {
          select: {
            id: true,
            amountSettled: true,
            settledAt: true,
            paymentBatch: {
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
         id: payout.loan.id,
    amount: payout.loan.amount,
    tenantId: payout.loan.tenantId,
    userId: payout.loan.userId,
    status: payout.loan.status,
    interestRate: payout.loan.interestRate,
    createdAt: payout.loan.createdAt,
    disbursedAt: payout.loan.disbursedAt,

    user: {
      firstName: payout.loan.user.firstName,
      lastName: payout.loan.user.lastName,
      phoneNumber: payout.loan.user.phoneNumber,
    },
        organization: {
          id: payout.loan.organization.id,
          name: payout.loan.organization.name,
        },
      },
      approvedBy: payout.approvedBy
        ? {
            firstName: payout.approvedBy.firstName,
            lastName: payout.approvedBy.lastName,
          }
        : null,
      confirmation: payout.confirmation
        ? {
            id: payout.confirmation.id,
            amountSettled: payout.confirmation.amountSettled,
            settledAt: payout.confirmation.settledAt,
            paymentBatch: {
              id: payout.confirmation.paymentBatch.id,
              reference: payout.confirmation.paymentBatch.reference,
              paymentMethod: payout.confirmation.paymentBatch.paymentMethod,
              totalAmount: payout.confirmation.paymentBatch.totalAmount,
              receivedAt: payout.confirmation.paymentBatch.receivedAt,
              remarks: payout.confirmation.paymentBatch.remarks,
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
          loan: {
            user: {
              firstName: { contains: name, mode: 'insensitive' },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          loan: {
            select: {
              id: true,
              amount: true,
              user: {
                select: {
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
          approvedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          confirmation: {
            select: {
              id: true,
              amountSettled: true,
              settledAt: true,
              paymentBatch: {
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
          loan: {
            user: {
              firstName: { contains: name, mode: 'insensitive' },
            },
          },
        },
      }),
    ]);

    // Format the response to match the LoanPayout type
  const formattedPayouts: LoanPayout[] = payouts.map((payout) => ({
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
    id: payout.loan.id,
    tenantId: payout.loan.tenantId,
    userId: payout.loan.userId,
    amount: payout.loan.amount,
    interestRate: payout.loan.interestRate,
    status: payout.loan.status,
    createdAt: payout.loan.createdAt,
    user: {
      firstName: payout.loan.user.firstName,
      lastName: payout.loan.user.lastName,
      phoneNumber: payout.loan.user.phoneNumber,
    },
    organization: {
      id: payout.loan.organization.id,
      name: payout.loan.organization.name,
    },
  },
  approvedBy: payout.approvedBy,
  confirmation: payout.confirmation,
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
        loan: {
          select: {
            id: true,
            amount: true,
            interestRate: true,
            status: true,
            createdAt: true,
            disbursedAt: true,
            tenantId: true,
            userId: true,
            
            user: {
              select: {
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
        approvedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        confirmation: {
          select: {
            id: true,
            amountSettled: true,
            settledAt: true,
            paymentBatch: {
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
  id: loanPayout.loan.id,
  userId: loanPayout.loan.userId,
  //organizationId: loanPayout.loan.organization.id,
  tenantId: loanPayout.loan.tenantId,
  amount: loanPayout.loan.amount,
  interestRate: loanPayout.loan.interestRate,
  status: loanPayout.loan.status,
  createdAt: loanPayout.loan.createdAt,
  user: {
    firstName: loanPayout.loan.user.firstName,
    lastName: loanPayout.loan.user.lastName,
    phoneNumber: loanPayout.loan.user.phoneNumber,
  },
  organization: {
    id: loanPayout.loan.organization.id,
    name: loanPayout.loan.organization.name,
  },
},
      approvedBy: loanPayout.approvedBy
        ? {
            firstName: loanPayout.approvedBy.firstName,
            lastName: loanPayout.approvedBy.lastName,
          }
        : null,
      confirmation: loanPayout.confirmation
        ? {
            id: loanPayout.confirmation.id,
            amountSettled: loanPayout.confirmation.amountSettled,
            settledAt: loanPayout.confirmation.settledAt,
            paymentBatch: {
              id: loanPayout.confirmation.paymentBatch.id,
              reference: loanPayout.confirmation.paymentBatch.reference,
              paymentMethod: loanPayout.confirmation.paymentBatch.paymentMethod,
              totalAmount: loanPayout.confirmation.paymentBatch.totalAmount,
              receivedAt: loanPayout.confirmation.paymentBatch.receivedAt,
              remarks: loanPayout.confirmation.paymentBatch.remarks,
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
        mpesaConfig: { select: { b2cShortCode: true } },
        tenant: { select: { id: true } },
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