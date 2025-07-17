
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();



export const calculateLoanInterestByLoanId = async (
  loanId: number
): Promise<number> => {
  if (!loanId) {
    throw new Error('Loan ID is required.');
  }

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: {
      amount: true,
      interestRate: true,
    },
  });

  if (!loan) {
    throw new Error('Loan not found.');
  }

  if (loan.interestRate == null) {
    throw new Error('Interest rate is not set for this loan.');
  }

  const interestAmount = (loan.interestRate / 100) * loan.amount;
  return parseFloat(interestAmount.toFixed(2));
};
