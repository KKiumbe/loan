//prisma client
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createMPESAConfig = async (req, res) => {
  try {
    console.log(Object.keys(prisma));
    console.log('req.body =', req.body); // Add this to see the incoming request body
    //const { tenantId } = req.user;
    const {  b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret,tenantId } = req.body;

    if (!tenantId || !b2cShortCode || !initiatorName || !securityCredential || !consumerKey || !consumerSecret) {
      return res.status(400).json({ message: 'All required fields (tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret) must be provided.' });
    }

    const existingConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
    });
    console.log('existingConfig =', existingConfig); // Add this to see the existing configuration    

    if (existingConfig) {
      return res.status(400).json({ message: 'M-Pesa B2C configuration already exists for this tenant.' });
    }

    const newConfig = await prisma.mPESAConfig.create({
      data: {
        tenantId,
        b2cShortCode,
        initiatorName,
        securityCredential,
        consumerKey,
        consumerSecret,
        
      },
    });

    res.status(201).json({
      success: true,
      message: 'M-Pesa B2C configuration created successfully.',
      data: newConfig,
    });
  } catch (error) {
    console.error('Error creating M-Pesa configuration:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create M-Pesa configuration.' });
  } finally {
    await prisma.$disconnect();
  }
};

const updateMPESAConfig = async (req, res) => {
  try {
    const { tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret} = req.body;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required.' });
    }

    const existingConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
    });

    if (!existingConfig) {
      return res.status(404).json({ message: 'M-Pesa B2C configuration not found for this tenant.' });
    }

    const updatedConfig = await prisma.mPESAConfig.update({
      where: { tenantId },
      data: {
        ...(b2cShortCode && { b2cShortCode }),
        ...(initiatorName && { initiatorName }),
        ...(securityCredential && { securityCredential }),
        ...(consumerKey && { consumerKey }),
        ...(consumerSecret && { consumerSecret }),
        
      },
    });

    res.status(200).json({
      success: true,
      message: 'M-Pesa B2C configuration updated successfully.',
      data: updatedConfig,
    });
  } catch (error) {
    console.error('Error updating M-Pesa configuration:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update M-Pesa configuration.' });
  } finally {
    await prisma.$disconnect();
  }
};

const getTenantSettings = async (tenantId) => {
  try {
    if (!tenantId) {
      throw new Error('Tenant ID is required.');
    }

    console.log(`Fetching M-Pesa B2C settings for tenant ID: ${tenantId}`);

    const mpesaConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
      select: {
        b2cShortCode: true,
        initiatorName: true,
        securityCredential: true,
        consumerKey: true,
        consumerSecret: true,
       
      },
    });

    if (!mpesaConfig) {
      throw new Error('No M-Pesa B2C settings found for this tenant.');
    }

    return {
      success: true,
      mpesaConfig: {
        b2cShortCode: mpesaConfig.b2cShortCode,
        initiatorName: mpesaConfig.initiatorName,
        securityCredential: mpesaConfig.securityCredential,
        consumerKey: mpesaConfig.consumerKey,
        consumerSecret: mpesaConfig.consumerSecret,
        
      },
    };
  } catch (error) {
    console.error('Error fetching tenant M-Pesa settings:', error.message);
    return { success: false, message: error.message };
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { createMPESAConfig, updateMPESAConfig, getTenantSettings };