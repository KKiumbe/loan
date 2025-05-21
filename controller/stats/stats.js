const { PrismaClient } = require('@prisma/client');
const { calculateBorrowCapacity } = require('../utils/loanCapacity.js');
const prisma = new PrismaClient();

 const getUserLoanStats = async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Parallel counts for basic stats
    const [
      totalLoansRequested,
      totalLoansPaid,
      totalLoansPending,
      totalLoansDisbursed
    ] = await Promise.all([
      prisma.loan.count({ where: { userId } }),
      prisma.loan.count({ where: { userId, status: 'REPAID' } }),
      prisma.loan.count({ where: { userId, status: 'PENDING' } }),
      prisma.loan.count({ where: { userId, disbursedAt: { not: null } } })
    ]);

    // 2. Compute borrow capacity for the current month
    const { canBorrow, remainingAmount, maxLoanAmount } = await calculateBorrowCapacity(userId);

    // 3. Return combined stats
    return res.json({
      totalLoansRequested,
      totalLoansPaid,
      totalLoansPending,
      totalLoansDisbursed,
      hasPendingLoan: totalLoansPending > 0,
      canBorrow,
      remainingAmount,
      maxLoanAmount
    });
  } catch (error) {
    console.error('Error fetching loan stats:', error);
    return res.status(500).json({ error: 'Could not fetch loan statistics.' });
  }
};

module.exports = {
  getUserLoanStats
};