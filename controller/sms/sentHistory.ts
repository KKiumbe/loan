// src/controller/sms/sentHistory.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient, SMSStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import ROLE_PERMISSIONS from '../../DatabaseConfig/role';

const prisma = new PrismaClient();


 

interface SMSHistory {
  id: number;
  mobile: string;
  message: string;
  status: SMSStatus;
  createdAt: Date;
}

interface SMSHistoryResponse {
  data: SMSHistory[];
  totalRecords: number;
}

// Get sent SMS history for a tenant
export const getSentSmsHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Check if user is authenticated
    if (!tenantId) {
      res.status(401).json({ message: 'Unauthorized: Tenant ID is required' });
      return;
    }



    // Fetch SMS history and total count concurrently
    const [data, totalRecords] = await Promise.all([
      prisma.sMS.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          mobile: true,
          message: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.sMS.count({
        where: { tenantId },
      }),
    ]);

    // Type the response
    const response: SMSHistoryResponse = { data, totalRecords };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error fetching SMS history:', error);
    next(new Error('Failed to fetch SMS history'));
  } finally {
    await prisma.$disconnect();
  }
};

export default { getSentSmsHistory };