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

    // Check permissions
if (
  !req.user?.role.some((role) =>
    ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.sms_history && 
    Array.isArray(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.sms_history) && 
    ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.sms_history.every((item) => typeof item === 'string') && 
    (ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.sms_history as string[]).includes('read')
  )
) {
  res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
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