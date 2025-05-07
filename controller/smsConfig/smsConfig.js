const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Update SMSConfig
const updateSMSConfig = async (req, res) => {
  const { tenantId } = req.user; // Extract tenantId from authenticated user
  const { partnerId, apiKey, shortCode,customerSupportPhoneNumber } = req.body; // Fields to update

  // Validate the tenantId
  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required for updating SMS configuration.' });
  }

  // Validate required fields
  if (!partnerId && !apiKey && !shortCode) {
    return res.status(400).json({ message: 'At least one field (partnerId, apiKey, shortCode) must be provided.' });
  }

  try {
    // Check if SMSConfig exists for the tenant
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (!smsConfig) {
      return res.status(404).json({ message: 'SMS configuration not found for this tenant.' });
    }

    // Update SMSConfig
    const updatedSMSConfig = await prisma.sMSConfig.update({
      where: { tenantId },
      data: {
        ...(partnerId && { partnerId }),
        ...(apiKey && { apiKey }),
        ...(shortCode && { shortCode }),
        ...(customerSupportPhoneNumber && { customerSupportPhoneNumber }),
      },
    });

    res.status(200).json({
      message: 'SMS configuration updated successfully',
      data: updatedSMSConfig,
    });
  } catch (error) {
    console.error('Error updating SMS configuration:', error);
    res.status(500).json({ message: 'Failed to update SMS configuration.', error: error.message });
  }
};



// Create SMSConfig
const createSMSConfig = async (req, res) => {
  const { tenantId } = req.user; // Extract tenantId from authenticated user
  const { partnerId, apiKey, shortCode,customerSupportPhoneNumber } = req.body; // Fields to create

  // Validate the tenantId
  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to create SMS configuration.' });
  }

  // Validate required fields
  if (!partnerId || !apiKey || !shortCode) {
    return res.status(400).json({ message: 'All fields (partnerId, apiKey, shortCode) are required.' });
  }

  try {
    // Check if an SMSConfig already exists for the tenant
    const existingSMSConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (existingSMSConfig) {
      return res.status(400).json({ message: 'SMS configuration already exists for this tenant.' });
    }

    // Create the new SMSConfig
    const newSMSConfig = await prisma.sMSConfig.create({
      data: {
        tenantId,
        partnerId,
        apiKey,
        shortCode,
        customerSupportPhoneNumber,
      },
    });

    res.status(201).json({
      message: 'SMS configuration created successfully',
      data: newSMSConfig,
    });
  } catch (error) {
    console.error('Error creating SMS configuration:', error);
    res.status(500).json({ message: 'Failed to create SMS configuration.', error: error.message });
  }
};





module.exports = {
  updateSMSConfig,createSMSConfig
};
