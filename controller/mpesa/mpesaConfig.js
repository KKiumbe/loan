//prisma client
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

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
  // 1. Get tenantId from the logged-in user
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: missing tenant context.' });
  }

  // 2. Destructure only the updatable fields from the body
  const {
    b2cShortCode,
    initiatorName,
    securityCredential,
    consumerKey,
    consumerSecret,
    name,           // optional human-friendly config name
  } = req.body;

  try {
    // 3. Make sure a config already exists for this tenant
    const existing = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: 'No M-Pesa configuration found for this tenant.' });
    }

    // 4. Build a data object containing only the provided fields
    const data = {
      ...(b2cShortCode && { b2cShortCode }),
      ...(initiatorName && { initiatorName }),
      ...(securityCredential && { securityCredential }),
      ...(consumerKey && { consumerKey }),
      ...(consumerSecret && { consumerSecret }),
      ...(name && { name }),
    };

    // 5. Update & return the new config
    const updatedConfig = await prisma.mPESAConfig.update({
      where: { tenantId },
      data,
    });

    return res.status(200).json({
      success: true,
      message: 'M-Pesa configuration updated successfully.',
      data: updatedConfig,
    });
  } catch (error) {
    console.error('Error updating M-Pesa config:', error);
    return res
      .status(500)
      .json({ success: false, message: 'An error occurred while updating configuration.' });
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

    // 1. load your public cert
    const certPath = path.resolve(
      __dirname,
      '../prodcert/ProductionCertificate.cer'
    );
    const publicKey = fs.readFileSync(certPath, 'utf8');

    // 2. fetch the stored config (including the plaintext credential)
    const mpesaConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
      select: {
        b2cShortCode: true,
        initiatorName: true,
        securityCredential: true, // plaintext in DB
        consumerKey: true,
        consumerSecret: true,
      },
    });

    if (!mpesaConfig) {
      throw new Error('No M-Pesa B2C settings found for this tenant.');
    }

    // 3. encrypt the plaintext securityCredential under the Safaricom public key
    const buffer = Buffer.from(mpesaConfig.securityCredential, 'utf8');
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    const securityCredentialEncrypted = encrypted.toString('base64');

    return {
      success: true,
      mpesaConfig: {
        b2cShortCode: mpesaConfig.b2cShortCode,
        initiatorName: mpesaConfig.initiatorName,
        securityCredential: securityCredentialEncrypted,
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