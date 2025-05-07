

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient(); 
const createMPESAConfig = async (req, res) => {
    try {
      const { tenantId, shortCode, name, apiKey, passKey } = req.body;
  
      if (!tenantId || !shortCode || !name || !apiKey || !passKey) {
        return res.status(400).json({ message: 'All fields are required.' });
      }
  
      const existingConfig = await prisma.mPESAConfig.findUnique({
        where: { tenantId },
      });
  
      if (existingConfig) {
        return res
          .status(400)
          .json({ message: 'MPESA configuration already exists for this tenant.' });
      }
  
      const newConfig = await prisma.mPESAConfig.create({
        data: {
          tenantId,
          shortCode,
          name,
          apiKey,
          passKey,
        },
      });
  
      res.status(201).json({
        success: true,
        message: 'MPESA configuration created successfully.',
        data: newConfig,
      });
    } catch (error) {
      console.error('Error creating MPESA configuration:', error.message);
      res.status(500).json({ success: false, message: 'Failed to create MPESA configuration.' });
    }
  };
  const updateMPESAConfig = async (req, res) => {
    try {
      const { tenantId, shortCode, name, apiKey, passKey } = req.body;
  
      if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID is required.' });
      }
  
      const existingConfig = await prisma.mPESAConfig.findUnique({
        where: { tenantId },
      });
  
      if (!existingConfig) {
        return res
          .status(404)
          .json({ message: 'MPESA configuration not found for this tenant.' });
      }
  
      const updatedConfig = await prisma.mPESAConfig.update({
        where: { tenantId },
        data: {
          ...(shortCode && { shortCode }),
          ...(name && { name }),
          ...(apiKey && { apiKey }),
          ...(passKey && { passKey }),
        },
      });
  
      res.status(200).json({
        success: true,
        message: 'MPESA configuration updated successfully.',
        data: updatedConfig,
      });
    } catch (error) {
      console.error('Error updating MPESA configuration:', error.message);
      res.status(500).json({ success: false, message: 'Failed to update MPESA configuration.' });
    }
  };



  const getTenantSettings = async (req, res) => {
    try {
      const { tenantId } = req.user; // Extract tenant ID from req.user
  
      if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID is required.' });
      }
  
      console.log(`Fetching settings for tenant ID: ${tenantId}`);
  
      // Fetch MPESA configuration for the tenant
      const mpesaConfig = await prisma.mPESAConfig.findUnique({
        where: { tenantId },
      });
  
      if (!mpesaConfig) {
        return res.status(404).json({ message: 'No settings found for this tenant.' });
      }
  
      res.status(200).json({
        success: true,
        message: 'Settings fetched successfully.',
        data: {
          mpesaConfig: {
            shortCode: mpesaConfig.shortCode,
            name: mpesaConfig.name,
            apiKey: mpesaConfig.apiKey,
            passKey: mpesaConfig.passKey,
          },
        },
      });
    } catch (error) {
      console.error('Error fetching tenant settings:', error.message);
      res.status(500).json({ success: false, message: 'Failed to fetch tenant settings.' });
    }
  };
  

  
  module.exports = {
    createMPESAConfig,updateMPESAConfig,getTenantSettings
  };
