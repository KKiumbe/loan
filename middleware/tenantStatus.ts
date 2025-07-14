import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Request to include user
/**
 * @typedef {import('express').Request} Request
 */

/**
 * @typedef {Request & { user?: { tenantId: number, [key: string]: any } }} AuthenticatedRequest
 */

/**
 * @param {AuthenticatedRequest} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const tenantStatusMiddleware = async (
  req,
  res,
  next
) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ error: 'Tenant ID missing from request' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    if (tenant.status === 'DISABLED') {
      res.status(403).json({ error: 'Your tenant account is disabled due to unpaid fees.' });
      return;
    }

    next();
  } catch (error) {
    console.error('Tenant status middleware error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default tenantStatusMiddleware;
