
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';



const prisma = new PrismaClient();

export const getTransactionFee = async (amount: number, tenantId: number): Promise<number> => {
  const band = await prisma.transactionCostBand.findFirst({
    where: {
      tenantId,
      minAmount: { lte: amount },
      maxAmount: { gte: amount },
    },
  });

  return band?.cost ?? 0;
};