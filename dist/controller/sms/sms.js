"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSms = exports.sendSMS = exports.sendToOne = exports.getLatestBalance = exports.sanitizePhoneNumber = exports.checkSmsBalance = exports.getShortCode = void 0;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const getSMSConfig_1 = require("../smsConfig/getSMSConfig");
const prisma = new client_1.PrismaClient();
// Environment variables
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const BULK_SMS_ENDPOINT = process.env.BULK_SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;
// Function to fetch short code
const getShortCode = async (tenantId) => {
    try {
        const config = await prisma.mPESAConfig.findUnique({
            where: { tenantId },
            select: { b2cShortCode: true },
        });
        return config ? config.b2cShortCode : null;
    }
    catch (error) {
        console.error('Error fetching shortCode:', error);
        return null;
    }
};
exports.getShortCode = getShortCode;
// Function to check SMS balance
const checkSmsBalance = async (apiKey, partnerId) => {
    if (!apiKey || !partnerId) {
        throw new Error('API key or partner ID is missing');
    }
    console.log(`Checking SMS balance with apiKey: ${apiKey} and partnerId: ${partnerId}`);
    try {
        const response = await axios_1.default.post(SMS_BALANCE_URL, {
            apikey: apiKey,
            partnerID: partnerId,
        });
        console.log('SMS balance:', response.data.balance);
        return response.data.balance;
    }
    catch (error) {
        console.error('Error checking SMS balance:', error.response?.data || error.message);
        throw new Error('Failed to retrieve SMS balance');
    }
};
exports.checkSmsBalance = checkSmsBalance;
// Function to sanitize phone numbers
const sanitizePhoneNumber = (phone) => {
    if (typeof phone !== 'string' || phone.trim() === '') {
        console.error('Invalid phone number format:', phone);
        return '';
    }
    const phoneRegex = /^\+?\d{10,15}$/;
    if (!phoneRegex.test(phone)) {
        console.error('Invalid phone number format:', phone);
        return '';
    }
    if (phone.startsWith('+254'))
        return phone.slice(1);
    if (phone.startsWith('0'))
        return `254${phone.slice(1)}`;
    if (phone.startsWith('254'))
        return phone;
    return `254${phone}`;
};
exports.sanitizePhoneNumber = sanitizePhoneNumber;
// Get SMS balance endpoint
const getLatestBalance = async (req, res) => {
    try {
        console.log('getLatestBalance: Starting for user:', req.user);
        if (!req.user) {
            console.log('getLatestBalance: No user in request');
            res.status(401).json({ message: 'Authentication required' });
            return;
        }
        const { tenantId } = req.user;
        console.log('getLatestBalance: Fetching SMS config for tenantId:', tenantId);
        const { apikey, partnerID } = await (0, getSMSConfig_1.getSMSConfigForTenant)(tenantId);
        console.log('getLatestBalance: SMS config:', { apikey, partnerID });
        if (!apikey || !partnerID) {
            console.log('getLatestBalance: SMS config not found');
            res.status(404).json({ message: 'SMS config not found' });
            return;
        }
        console.log('getLatestBalance: Sending axios request to SMS_BALANCE_URL');
        const response = await axios_1.default.post(process.env.SMS_BALANCE_URL, { apikey, partnerID }, { timeout: 5000 });
        console.log('getLatestBalance: Axios response:', response.data);
        // Validate response.data.credit
        if (!response.data || typeof response.data.credit === 'undefined') {
            console.log('getLatestBalance: Invalid or missing credit in response');
            res.status(200).json({
                credit: 'N/A',
                message: 'Invalid response from SMS balance API',
            });
            return;
        }
        console.log('getLatestBalance: Sending success response with credit:', response.data.credit);
        res.status(200).json({ credit: response.data.credit });
        return;
    }
    catch (error) {
        console.error('getLatestBalance: Error:', error.code || error.message, error.stack);
        if (res.headersSent) {
            console.warn('getLatestBalance: Headers already sent, skipping response');
            return;
        }
        const isTimeout = error.code === 'ECONNABORTED';
        console.log('getLatestBalance: Sending error response, timeout:', isTimeout);
        res.status(200).json({
            credit: 'N/A',
            message: isTimeout
                ? 'SMS balance request timed out. Try again later.'
                : 'Unable to fetch SMS balance. Please try again later.',
        });
        return;
    }
};
exports.getLatestBalance = getLatestBalance;
// Send SMS to one customer
const sendToOne = async (req, res, next) => {
    const { tenantId } = req.user;
    const { mobile, message } = req.body;
    if (!mobile || !message) {
        res.status(400).json({ success: false, message: 'Mobile and message are required' });
        return;
    }
    try {
        const response = await (0, exports.sendSMS)(tenantId, mobile, message);
        res.status(200).json({ success: true, response });
    }
    catch (error) {
        console.error('Error in sendToOne:', error.message);
        next(error);
    }
};
exports.sendToOne = sendToOne;
// Core sendSMS function
const sendSMS = async (tenantId, mobile, message) => {
    console.log(`Sending SMS to ${mobile}`);
    let clientsmsid = undefined;
    try {
        if (!SMS_ENDPOINT) {
            throw new Error('SMS_ENDPOINT is not configured');
        }
        const { partnerID, apikey, shortCode } = await (0, getSMSConfig_1.getSMSConfigForTenant)(tenantId);
        const sanitizedPhoneNumber = (0, exports.sanitizePhoneNumber)(mobile);
        if (!sanitizedPhoneNumber) {
            throw new Error('Invalid phone number');
        }
        clientsmsid = (0, uuid_1.v4)();
        console.log(`Creating SMS record with clientsmsid: ${clientsmsid}`);
        const smsRecord = await prisma.sMS.create({
            data: {
                tenantId,
                clientsmsid,
                mobile: sanitizedPhoneNumber,
                message,
                status: client_1.SMSStatus.PENDING,
            },
        });
        console.log(`SMS record created: ${JSON.stringify(smsRecord)}`);
        const payload = {
            apikey,
            partnerID,
            message,
            shortcode: shortCode,
            mobile: sanitizedPhoneNumber,
        };
        console.log(`Sending SMS with payload: ${JSON.stringify(payload)}`);
        const SMS_TIMEOUT = 10000; // 10 seconds
        const response = await axios_1.default.post(SMS_ENDPOINT, payload, {
            timeout: SMS_TIMEOUT,
        });
        console.log(`SMS sent successfully to ${sanitizedPhoneNumber}:`, response.data);
        await prisma.sMS.update({
            where: { id: smsRecord.id },
            data: { status: client_1.SMSStatus.SENT },
        });
        console.log(`SMS status updated to SENT for clientsmsid: ${clientsmsid}`);
        return response.data;
    }
    catch (error) {
        console.error('Error sending SMS:', {
            message: error.message,
            stack: error.stack,
            mobile,
        });
        if (clientsmsid) {
            try {
                await prisma.sMS.update({
                    where: { clientsmsid },
                    data: { status: client_1.SMSStatus.FAILED },
                });
                console.log(`SMS status updated to FAILED for clientsmsid: ${clientsmsid}`);
            }
            catch (updateError) {
                console.error('Error updating SMS status to FAILED:', updateError);
            }
        }
        throw new Error(error.response ? error.response.data.message : 'Failed to send SMS');
    }
};
exports.sendSMS = sendSMS;
// Bulk SMS sending function
const sendSms = async (tenantId, messages) => {
    try {
        if (!BULK_SMS_ENDPOINT) {
            throw new Error('BULK_SMS_ENDPOINT is not configured');
        }
        const { partnerID, apikey, shortCode } = await (0, getSMSConfig_1.getSMSConfigForTenant)(tenantId);
        if (!partnerID || !apikey || !shortCode) {
            throw new Error('Missing SMS configuration for tenant');
        }
        const smsList = messages.map((msg) => ({
            apikey,
            partnerID,
            message: msg.message,
            shortcode: shortCode,
            mobile: String(msg.mobile),
        }));
        const batchSize = 450;
        const batches = [];
        for (let i = 0; i < smsList.length; i += batchSize) {
            batches.push(smsList.slice(i, i + batchSize));
        }
        const allResponses = [];
        for (const batch of batches) {
            const payload = { smslist: batch };
            console.log(`Sending SMS payload: ${JSON.stringify(payload)}`);
            let response;
            try {
                response = await axios_1.default.post(BULK_SMS_ENDPOINT, payload);
                console.log(`Batch of ${batch.length} SMS sent successfully:`, response.data);
            }
            catch (error) {
                console.error('Bulk SMS API error:', error.response?.data || error.message);
                response = { data: { status: 'FAILED', message: 'Bulk SMS failed' } };
            }
            const smsLogs = batch.map((sms) => ({
                clientsmsid: (0, uuid_1.v4)(),
                tenantId,
                mobile: sms.mobile,
                message: sms.message,
                status: response.data.status === 'FAILED' ? client_1.SMSStatus.FAILED : client_1.SMSStatus.SENT,
                createdAt: new Date(),
            }));
            await prisma.sMS.createMany({ data: smsLogs });
            allResponses.push(response.data);
        }
        return allResponses;
    }
    catch (error) {
        console.error('Error sending SMS:', error);
        throw new Error('Failed to send SMS');
    }
};
exports.sendSms = sendSms;
exports.default = {
    sendSMS: exports.sendSMS,
    sendSms: exports.sendSms,
    sendToOne: exports.sendToOne,
    checkSmsBalance: exports.checkSmsBalance,
    getLatestBalance: exports.getLatestBalance,
    getShortCode: exports.getShortCode,
};
