const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();



const getAllLoanPayouts = async (req, res) => {
  const user = req.user;

  if (!user?.tenantId) {
    return res.status(401).json({ message: 'Unauthorized. Tenant not found in session.' });
  }

  try {
    const payouts = await prisma.loanPayout.findMany({
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
            organization: {
              select: { name: true },
            },
            user: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
        confirmation: {
          select: {
            amountSettled: true,
            settledAt: true,
            paymentBatch: {
              select: {
                paymentMethod: true,
                reference: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({ data: payouts });
  } catch (error) {
    console.error('Error fetching payouts:', error);
    return res.status(500).json({ message: 'Failed to fetch loan payouts', error: error.message });
  }
};

const makeOrganizationPayment = async (req, res) => {
  const { organizationId, totalAmount, method, reference, remarks } = req.body;
  const {tenantId} = req.user;

  // if (!tenantId || !organizationId || !totalAmount || !method) {
  //   return res.status(400).json({ message: 'Missing required fields' });
  // }

  try {
    // 1. Fetch all disbursed loans for the organization
    const disbursedLoans = await prisma.loan.findMany({
      where: {
        organizationId,
        tenantId,
        status: 'DISBURSED',
      },
      include: {
        LoanPayout: {
          where: { status: 'DISBURSED' }
        }
      }
    });

    if (!disbursedLoans.length) {
      return res.status(404).json({ message: 'No disbursed loans found for this organization.' });
    }

    // 2. Create a payment batch
    const paymentBatch = await prisma.paymentBatch.create({
      data: {
        organizationId,
        tenantId,
        totalAmount,
        paymentMethod: method,
        reference,
        remarks,
      },
    });

    // 3. Settle payouts
    let remaining = totalAmount;
    const confirmations = [];

    for (const loan of disbursedLoans) {
      for (const payout of loan.LoanPayout) {
        if (remaining <= 0) break;

        const amountToSettle = Math.min(payout.amount, remaining);

        const confirmation = await prisma.paymentConfirmation.create({
          data: {
            paymentBatchId: paymentBatch.id,
            loanPayoutId: payout.id,
            amountSettled: amountToSettle,
          },
        });

        confirmations.push(confirmation);
        remaining -= amountToSettle;
      }

      if (remaining <= 0) break;
    }

    return res.status(200).json({
      message: 'Organization payment processed successfully.',
      paymentBatch,
      confirmations,
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    return res.status(500).json({ message: 'Failed to process payment.', error: error.message });
  }
};


const getPaymentConfirmations = async (req, res) => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const confirmations = await prisma.paymentConfirmation.findMany({
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

    return res.status(200).json({ confirmations: formatted });

  } catch (error) {
    console.error('Error fetching confirmations:', error);
    return res.status(500).json({ message: 'Failed to fetch payment confirmations.' });
  }
};



const getPaymentBatches = async (req, res) => {
  try {
    const {tenantId} = req.user;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID missing' });
    }

    // Optional: support pagination via ?page=1&limit=20
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [ batches, total ] = await Promise.all([
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
      prisma.paymentBatch.count({ where: { tenantId } })
    ]);

    // format response
    const formatted = batches.map(b => ({
      id: b.id,
      organizationName: b.organization.name,
      totalAmount: b.totalAmount,
      paymentMethod: b.paymentMethod,
      reference: b.reference,
      remarks: b.remarks,
      receivedAt: b.receivedAt,
      confirmationCount: b.confirmations.length,
    }));

    return res.status(200).json({
      batches: formatted,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error('Error fetching payment batches', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};








// Controller to fetch a payment by ID with associated invoices and customer details
const fetchPaymentById = async (req, res) => {
    const { paymentId } = req.params; // Get the payment ID from request parameters

    try {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId }, // Treat paymentId as a string
            include: {
                receipt: {
                    include: {
                        receiptInvoices: {
                            include: {
                                invoice: true, // Include associated invoices
                            },
                        },
                    },
                },
            },
        });

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' }); // Handle case where payment is not found
        }

        res.status(200).json(payment); // Respond with the payment data
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};









// Search payments by name
const searchPaymentsByName = async (req, res) => {
  const { name, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Name parameter is required' });
  }

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          firstName: { contains: name, mode: 'insensitive' }, // Only search by firstName
        },
        skip,
        take: parseInt(limit),
        include: {
          receipt: {
            include: {
              receiptInvoices: { include: { invoice: true } },
            },
          },
        },
      }),
      prisma.payment.count({
        where: {
          tenantId,
          firstName: { contains: name, mode: 'insensitive' }, // Only count by firstName
        },
      }),
    ]);

    res.json({ payments, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};


const searchTransactionById = async (req, res) => {
  const { transactionId } = req.query;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID parameter is required' });
  }

  try {
    const transaction = await prisma.payment.findUnique({
      where: {
        transactionId, // Search by unique transactionId
        tenantId,     // Ensure it belongs to the tenant
      },
      include: {
        receipt: {
          include: {
            receiptInvoices: { include: { invoice: true } },
          },
        },
      },
    });

    // Check if transaction exists
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction ID not found' });
    }

    res.json({ transaction });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};


const filterPaymentsByMode = async (req, res) => {
  const { mode, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  if (!mode) {
    return res.status(400).json({ error: 'Mode of payment parameter is required' });
  }

  // Validate the mode against the enum values
  const validModes = ['CASH', 'MPESA', 'BANK_TRANSFER'];
  const modeUpper = mode.toUpperCase();
  if (!validModes.includes(modeUpper)) {
    return res.status(400).json({ error: 'Invalid mode of payment. Must be CASH, MPESA, or BANK_TRANSFER' });
  }

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          modeOfPayment: modeUpper, // Filter by the enum value
        },
        skip,
        take: parseInt(limit),
        include: {
          receipt: {
            include: {
              receiptInvoices: { include: { invoice: true } },
            },
          },
        },
      }),
      prisma.payment.count({
        where: {
          tenantId,
          modeOfPayment: modeUpper,
        },
      }),
    ]);

    // Check if any payments were found
    if (payments.length === 0) {
      return res.status(404).json({ error: 'No payments found for this mode of payment' });
    }

    res.json({ payments, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};




const getUnreceiptedPayments = async (req, res) => {
    const tenantId = req.user?.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
  
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized: Tenant ID not found" });
    }
  
    try {
      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: {
            tenantId,
            receipted: false, // Only fetch payments where receipted is false
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }, 
       
        }),
        prisma.payment.count({
          where: {
            tenantId,
            receipted: false, // Count only unreceipted payments
          },
        }),
      ]);
  
      res.json({ payments, total });
    } catch (error) {
      console.error("Error fetching unreceipted payments:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  };
  
;
  







// Export the controller functions
module.exports = { 
 
    
 getAllLoanPayouts,makeOrganizationPayment,getPaymentConfirmations,getPaymentBatches
};
