"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSMSConfigForTenant = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * @typedef {Object} SMSConfig
 * @property {string} partnerID
 * @property {string} apikey
 * @property {string} shortCode
 * @property {string} customerSupportPhoneNumber
 */
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
        customerSupportPhoneNumber: smsConfig.customerSupportPhoneNumber,
    };
};
exports.getSMSConfigForTenant = getSMSConfigForTenant;
