const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getSMSConfigForTenant = async (tenantId) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required to retrieve SMS configuration.');
  }

  const smsConfig = await prisma.sMSConfig.findUnique({
    where: { tenantId },
  });

  if (!smsConfig) {
    throw new Error(`SMS configuration not found for tenant ID: ${tenantId}`);
  }

  console.log(`this is the ${JSON.stringify(smsConfig)}`);

  return {
    partnerID: smsConfig.partnerId,
    apikey: smsConfig.apiKey,
    shortCode: smsConfig.shortCode,
    customerSupportPhoneNumber:smsConfig.customerSupportPhoneNumber
  };

  
};



module.exports = { getSMSConfigForTenant };
