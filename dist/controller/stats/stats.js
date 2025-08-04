"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserLoanStats = void 0;
// src/controllers/loanStatsController.ts
const client_1 = require("@prisma/client");
const loanCapacity_1 = require("../utils/loanCapacity");
const prisma = new client_1.PrismaClient();
const getUserLoanStats = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized: User ID not found' });
        return;
    }
    try {
        // 1. Parallel counts for basic stats
        const [totalLoansRequested, totalLoansPaid, totalLoansPending, totalLoansDisbursed,] = await Promise.all([
            prisma.loan.count({ where: { userId } }),
            prisma.loan.count({ where: { userId, status: 'REPAID' } }),
            prisma.loan.count({ where: { userId, status: 'PENDING' } }),
            prisma.loan.count({ where: { userId, disbursedAt: { not: null } } }),
        ]);
        // 2. Compute borrow capacity for the current month
        const { canBorrow, remainingAmount, maxLoanAmount } = await (0, loanCapacity_1.calculateBorrowCapacity)(userId);
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
    }
    catch (error) {
        console.error('Error fetching loan stats:', error);
        res.status(500).json({ error: 'Could not fetch loan statistics.' });
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.getUserLoanStats = getUserLoanStats;
