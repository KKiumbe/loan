"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSMSConfig = exports.updateSMSConfig = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Interface for request body for both create and update
// Update SMSConfig
const updateSMSConfig = async (req, res) => {
    const { tenantId } = req.user; // Extract tenantId from authenticated user
    const { partnerId, apiKey, shortCode, customerSupportPhoneNumber } = req.body; // Fields to update
    // Validate the tenantId
    if (!tenantId) {
        res.status(403).json({ message: 'Tenant ID is required for updating SMS configuration.' });
        return;
    }
    // Validate required fields
    if (!partnerId && !apiKey && !shortCode && !customerSupportPhoneNumber) {
        res.status(400).json({ message: 'At least one field (partnerId, apiKey, shortCode, customerSupportPhoneNumber) must be provided.' });
        return;
    }
    try {
        // Check if SMSConfig exists for the tenant
        const smsConfig = await prisma.sMSConfig.findUnique({
            where: { tenantId },
        });
        if (!smsConfig) {
            res.status(404).json({ message: 'SMS configuration not found for this tenant.' });
            return;
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
    }
    catch (error) {
        console.error('Error updating SMS configuration:', error);
        res.status(500).json({ message: 'Failed to update SMS configuration.', error: error.message });
    }
};
exports.updateSMSConfig = updateSMSConfig;
// Create SMSConfig
const createSMSConfig = async (req, res) => {
    const { tenantId } = req.user; // Extract tenantId from authenticated user
    const { partnerId, apiKey, shortCode, customerSupportPhoneNumber } = req.body; // Fields to create
    // Validate the tenantId
    if (!tenantId) {
        res.status(403).json({ message: 'Tenant ID is required to create SMS configuration.' });
        return;
    }
    // Validate required fields
    if (!partnerId || !apiKey || !shortCode) {
        res.status(400).json({ message: 'All fields (partnerId, apiKey, shortCode) are required.' });
        return;
    }
    try {
        // Check if an SMSConfig already exists for the tenant
        const existingSMSConfig = await prisma.sMSConfig.findUnique({
            where: { tenantId },
        });
        if (existingSMSConfig) {
            res.status(400).json({ message: 'SMS configuration already exists for this tenant.' });
            return;
        }
        // Create the new SMSConfig
        const newSMSConfig = await prisma.sMSConfig.create({
            data: {
                tenantId,
                partnerId,
                apiKey,
                shortCode,
                customerSupportPhoneNumber: customerSupportPhoneNumber, // Handle optional field
            },
        });
        res.status(201).json({
            message: 'SMS configuration created successfully',
            data: newSMSConfig,
        });
    }
    catch (error) {
        console.error('Error creating SMS configuration:', error);
        res.status(500).json({ message: 'Failed to create SMS configuration.', error: error.message });
    }
};
exports.createSMSConfig = createSMSConfig;
