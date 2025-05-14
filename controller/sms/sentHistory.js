
const { PrismaClient } = require('@prisma/client');



const prisma = new PrismaClient();

// controller/sms/sentHistory.js

const getSentSmsHistory = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

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

    return res.status(200).json({ data, totalRecords });
  } catch (error) {
    console.error('Error fetching SMS history:', error);
    return res.status(500).json({ message: 'Failed to fetch SMS history' });
  }
};


module.exports = { getSentSmsHistory };
