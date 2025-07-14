// src/controllers/loanStatsController.ts
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { LoanCapacity } from '../../types/userloansStats';
import { calculateBorrowCapacity } from '../utils/loanCapacity';


const prisma = new PrismaClient();


const getUserLoanStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized: User ID not found' });
    return;
  }

  try {
    // 1. Parallel counts for basic stats
    const [
      totalLoansRequested,
      totalLoansPaid,
      totalLoansPending,
      totalLoansDisbursed,
    ]: [number, number, number, number] = await Promise.all([
      prisma.loan.count({ where: { userId } }),
      prisma.loan.count({ where: { userId, status: 'REPAID' } }),
      prisma.loan.count({ where: { userId, status: 'PENDING' } }),
      prisma.loan.count({ where: { userId, disbursedAt: { not: null } } }),
    ]);

    // 2. Compute borrow capacity for the current month
    const { canBorrow, remainingAmount, maxLoanAmount }: LoanCapacity = await calculateBorrowCapacity(userId);

    // 3. Return combined stats
    res.json({
      totalLoansRequested,
      totalLoansPaid,
      totalLoansPending,
      totalLoansDisbursed,
      hasPendingLoan: totalLoansPending > 0,
      canBorrow,
      remainingAmount,
      maxLoanAmount,
    });
  } catch (error: any) {
    console.error('Error fetching loan stats:', error);
    res.status(500).json({ error: 'Could not fetch loan statistics.' });
  } finally {
    await prisma.$disconnect();
  }
};

export { getUserLoanStats };