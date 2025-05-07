// controllers/dashboardController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDashboardStats = async (req, res) => {

  const {tenantId} = req.user; // Extract tenantId from authenticated user

  // Validate required fields
  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
  }

  try {
    // Fetch all active customers with their invoices and monthly charge
    const activeCustomers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId
        // Only fetch active customers
      },
      include: {
        invoices: true, // Include invoices for status checks
      },
    });

    // Calculate statistics based on the active customer data
    const paidCustomers = activeCustomers.filter(customer => 
      customer.closingBalance < 0
    ).length;

    const unpaidCustomers = activeCustomers.filter(customer => 
      customer.closingBalance > 0 // Customers who owe money (closing balance less than 15% of monthly charge)
    ).length;

    const lowBalanceCustomers = activeCustomers.filter(customer => 
      customer.closingBalance < customer.monthlyCharge  // Customers with closing balance less than their monthly charge
    ).length;

    const highBalanceCustomers = activeCustomers.filter(customer => 
      customer.closingBalance > customer.monthlyCharge * 1.5 // Customers with closing balance more than 1.5 times their monthly charge
    ).length;

    const totalCustomers = activeCustomers.length; // Count of active customers

    const overdueCustomers = activeCustomers.filter(customer => {
      // Check if the customer has more than 2 unpaid invoices
      const unpaidInvoices = customer.invoices.filter(invoice => invoice.status === 'UNPAID');
      return unpaidInvoices.length > 2;
    }).length;

    // Send the response
    res.status(200).json({
      success: true,
      data: {
        paidCustomers,
        unpaidCustomers,
        lowBalanceCustomers,
        highBalanceCustomers,
        totalCustomers,
        overdueCustomers,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats.' });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = {
  getDashboardStats,
};
