
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function tenantStatusMiddleware(req, res, next) {
    const tenantId = req.user.tenantId; // Assuming user info is attached to req
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
  
    if (tenant.status === 'DISABLED') {
      return res.status(403).json({ error: 'Your tenant account is disabled due to unpaid fees.' });
    }
  
    next();
  }
  
  module.exports = tenantStatusMiddleware;
