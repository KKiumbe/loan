const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Controller to fetch all payments with associated invoices and customer details
const fetchAllPayments = async (req, res) => {
    try {
        const payments = await prisma.payment.findMany({
            include: {
                receipt: {
                    include: {
                        receiptInvoices: {
                            include: {
                                invoice: true, // Include associated invoices
                            },
                        },
                    },
                }
            },
            orderBy: {
                id: 'desc' // Order payments by ID in descending order
            },
        });

        res.status(200).json(payments); // Respond with the payments data
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



// Controller to fetch payments by Mpesa transaction ID
const fetchPaymentsByTransactionId = async (req, res) => {
  try {
    const { transactionId } = req.query; 
    const tenantId = req.user?.tenantId; // Ensure the user is from the same organization

    if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const payment = await prisma.payment.findUnique({
        where: {
            transactionId,
            tenantId, // Ensuring the user is only accessing their own organization's data
        },
        include: {
            tenant: true,
            receipt: true,
        },
    });

    if (!payment) {
        return res.status(404).json({ error: 'Payment not found or not accessible' });
    }

    res.json(payment);
} catch (error) {
    console.error('Error searching payment:', error);
    res.status(500).json({ error: 'Internal server error' });
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





// Phone number sanitization function
const sanitizePhoneNumber = (phone) => {
  if (!phone) return null;
  let sanitized = phone.replace(/\D/g, '');
  if (sanitized.startsWith('254')) {
    sanitized = '0' + sanitized.substring(3);
  } else if (sanitized.startsWith('+254')) {
    sanitized = '0' + sanitized.substring(4);
  } else if (!sanitized.startsWith('0')) {
    return null;
  }
  return sanitized;
};

const getAllPayments = async (req, res) => {
  const tenantId = req.user?.tenantId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const modeOfPayment = req.query.modeOfPayment?.toUpperCase(); // e.g., MPESA
  const search = req.query.search?.trim(); // Search by transactionId or firstName
  const skip = (page - 1) * limit;

  // Validate tenantId
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }

  // Validate pagination
  if (page < 1 || limit < 1) {
    return res.status(400).json({ error: 'Invalid page or limit value' });
  }

  // Validate modeOfPayment if provided
  const validModes = ['CASH', 'MPESA', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD'];
  if (modeOfPayment && !validModes.includes(modeOfPayment)) {
    return res.status(400).json({ error: `Invalid modeOfPayment. Must be one of: ${validModes.join(', ')}` });
  }

  try {
    // Build where clause
    const where = {
      tenantId,
      ...(modeOfPayment && { modeOfPayment }),
      ...(search && {
        OR: [
          { transactionId: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Fetch payments and total count concurrently
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          amount: true,
          modeOfPayment: true,
          firstName: true,
          receipted: true,
          transactionId: true,
          ref: true,
          receiptId: true,
          createdAt: true,
          receipt: {
            select: {
              id: true,
              receiptInvoices: {
                select: {
                  id: true,
                  invoice: {
                    select: {
                      id: true,
                      invoiceNumber: true,
                      invoiceAmount: true,
                    },
                  },
                },
              },
            },
          },
          Invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceAmount : true,
            },
          },
          Customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    // Format response
    res.json({
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};


// Search payments by phone number
const searchPaymentsByPhone = async (req, res) => {
  const { ref, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }
  if (!ref) {
    return res.status(400).json({ error: 'Reference number parameter is required' });
  }

  try {
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          ref: { contains: ref, mode: 'insensitive' }, // Search by ref
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
          ref: { contains: ref, mode: 'insensitive' }, // Count by ref
        },
      }),
    ]);

    // Check if no payments were found
    if (payments.length === 0) {
      return res.status(404).json({ error: 'Reference number not available' });
    }

    res.json({ payments, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
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
 
    fetchAllPayments, 
    fetchPaymentById, 
    fetchPaymentsByTransactionId ,getAllPayments,searchPaymentsByPhone,searchPaymentsByName,getUnreceiptedPayments ,searchTransactionById ,filterPaymentsByMode
};
