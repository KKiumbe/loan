"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultTransactionBands = exports.createTransactionCharge = exports.fetchLatestBalance = exports.getTenantSettings = exports.isMPESASettingsSuccess = exports.updateMPESAConfig = exports.createMPESAConfig = void 0;
// src/utils/mpesaConfig.ts
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient();
const createMPESAConfig = async (req, res) => {
    try {
        const { b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret, tenantId } = req.body;
        if (!tenantId || !b2cShortCode || !initiatorName || !securityCredential || !consumerKey || !consumerSecret) {
            res.status(400).json({
                message: 'All required fields (tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret) must be provided.',
            });
            return;
        }
        const existingConfig = await prisma.mPESAConfig.findUnique({ where: { tenantId } });
        if (existingConfig) {
            res.status(400).json({ message: 'M-Pesa B2C configuration already exists for this tenant.' });
            return;
        }
        const newConfig = await prisma.mPESAConfig.create({
            data: { tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret },
        });
        res.status(201).json({ success: true, message: 'M-Pesa B2C configuration created successfully.', data: newConfig });
    }
    catch (error) {
        console.error('Error creating M-Pesa configuration:', error.message);
        res.status(500).json({ success: false, message: 'Failed to create M-Pesa configuration.' });
    }
};
exports.createMPESAConfig = createMPESAConfig;
const updateMPESAConfig = async (req, res) => {
    const { tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret, name } = req.body;
    try {
        const existing = await prisma.mPESAConfig.findUnique({ where: { tenantId } });
        if (!existing) {
            res.status(404).json({ success: false, message: 'No M-Pesa configuration found for this tenant.' });
            return;
        }
        const data = {
            ...(b2cShortCode && { b2cShortCode }),
            ...(initiatorName && { initiatorName }),
            ...(securityCredential && { securityCredential }),
            ...(consumerKey && { consumerKey }),
            ...(consumerSecret && { consumerSecret }),
            ...(name && { name }),
        };
        const updatedConfig = await prisma.mPESAConfig.update({
            where: { tenantId },
            data,
        });
        res.status(200).json({ success: true, message: 'M-Pesa configuration updated successfully.', data: updatedConfig });
    }
    catch (error) {
        console.error('Error updating M-Pesa config:', error.message);
        res.status(500).json({ success: false, message: 'An error occurred while updating configuration.' });
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.updateMPESAConfig = updateMPESAConfig;
function isMPESASettingsSuccess(settings) {
    return settings.success === true;
}
exports.isMPESASettingsSuccess = isMPESASettingsSuccess;
const getTenantSettings = async (tenantId) => {
    try {
        if (!tenantId)
            throw new Error('Tenant ID is required.');
        const certPath = path_1.default.resolve(__dirname, '../prodcert/ProductionCertificate.cer');
        const publicKey = fs_1.default.readFileSync(certPath, 'utf8');
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
        const buffer = Buffer.from(mpesaConfig.securityCredential, 'utf8');
        const encrypted = crypto_1.default.publicEncrypt({ key: publicKey, padding: crypto_1.default.constants.RSA_PKCS1_PADDING }, buffer);
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
    }
    catch (error) {
        console.error('Error fetching tenant M-Pesa settings:', error.message);
        return { success: false, message: error.message };
    }
};
exports.getTenantSettings = getTenantSettings;
const fetchLatestBalance = async (tenantId) => {
    try {
        return await prisma.mPesaBalance.findFirst({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });
    }
    catch (error) {
        console.error('Error fetching latest M-Pesa balance:', error.message);
        throw error; // Re-throw to let caller handle
    }
};
exports.fetchLatestBalance = fetchLatestBalance;
const createTransactionCharge = async (req, res) => {
    const { minAmount, maxAmount, cost } = req.body;
    const tenantId = req.user?.tenantId;
    if (!tenantId || minAmount == null || maxAmount == null || cost == null) {
        res.status(400).json({ message: 'Missing required fields.' });
        return;
    }
    if (minAmount >= maxAmount) {
        res.status(400).json({ message: 'minAmount must be less than maxAmount.' });
        return;
    }
    try {
        // Prevent overlap with existing bands
        const existingOverlap = await prisma.transactionCostBand.findFirst({
            where: {
                tenantId,
                OR: [
                    {
                        minAmount: { lte: maxAmount },
                        maxAmount: { gte: minAmount },
                    },
                ],
            },
        });
        if (existingOverlap) {
            res.status(400).json({ message: 'Overlapping amount band exists.' });
            return;
        }
        const newBand = await prisma.transactionCostBand.create({
            data: {
                tenantId,
                minAmount,
                maxAmount,
                cost,
            },
        });
        res.status(201).json(newBand);
    }
    catch (error) {
        console.error('Failed to create charge:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};
exports.createTransactionCharge = createTransactionCharge;
const createDefaultTransactionBands = async (req, res) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
        res.status(400).json({ message: 'Missing tenant ID.' });
        return;
    }
    const defaultCostBands = [
        { minAmount: 1, maxAmount: 49, cost: 0 },
        { minAmount: 50, maxAmount: 100, cost: 0 },
        { minAmount: 101, maxAmount: 500, cost: 7 },
        { minAmount: 501, maxAmount: 1000, cost: 13 },
        { minAmount: 1001, maxAmount: 1500, cost: 23 },
        { minAmount: 1501, maxAmount: 2500, cost: 33 },
        { minAmount: 2501, maxAmount: 3500, cost: 53 },
        { minAmount: 3501, maxAmount: 5000, cost: 57 },
        { minAmount: 5001, maxAmount: 7500, cost: 78 },
        { minAmount: 7501, maxAmount: 10000, cost: 90 },
        { minAmount: 10001, maxAmount: 15000, cost: 100 },
        { minAmount: 15001, maxAmount: 20000, cost: 105 },
        { minAmount: 20001, maxAmount: 35000, cost: 108 },
        { minAmount: 35001, maxAmount: 50000, cost: 108 },
        { minAmount: 50001, maxAmount: 250000, cost: 108 },
    ];
    try {
        await prisma.transactionCostBand.createMany({
            data: defaultCostBands.map((band) => ({
                ...band,
                tenantId,
            })),
            skipDuplicates: true,
        });
        res.status(201).json({ message: 'Transaction cost bands created successfully.' });
    }
    catch (error) {
        console.error('Error creating bands:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};
exports.createDefaultTransactionBands = createDefaultTransactionBands;
