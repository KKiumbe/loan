const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const calculateBorrowCapacity = async function(userId) {
  // 0. Grab the employeeId off the User record
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employeeId: true }
  });
  if (!user || !user.employeeId) {
    throw new Error('No employee profile linked to this user');
  }

  // 1. Load the employee + org multiplier
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { organization: true }
  });
  if (!employee) {
    throw new Error('Employee record not found');
  }

  // 2. Compute absolute cap
  const maxLoanAmount = employee.grossSalary * employee.organization.loanLimitMultiplier;

  // 3. Bound the current calendar month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 4. Sum up loans created this month
  const { _sum } = await prisma.loan.aggregate({
    where: {
      userId,
      createdAt: { gte: monthStart, lte: monthEnd }
    },
    _sum: { amount: true }
  });
  const borrowedThisMonth = _sum.amount ?? 0;

  // 5. Compute remaining & flag
  const remainingAmount = Math.max(0, maxLoanAmount - borrowedThisMonth);
  const canBorrow = remainingAmount > 0;

  return { canBorrow, remainingAmount, maxLoanAmount };
}

module.exports = {
  calculateBorrowCapacity
};