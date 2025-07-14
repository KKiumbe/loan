

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from './verifyToken';

const prisma = new PrismaClient();


 
const tenantStatusMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,

) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ error: 'Tenant ID missing from request' });
      return;
    }
  } catch (error) {
    // You may want to add error handling here
  }
};;

export default tenantStatusMiddleware;
