"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizePhoneNumber = exports.sendSMS = void 0;
// src/sms/sms.ts
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Load environment variables with type safety
const SMS_API_KEY = process.env.SMS_API_KEY;
const PARTNER_ID = process.env.PARTNER_ID;
const SHORTCODE = process.env.SHORTCODE;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;
// Function to send SMS with balance check
const sendSMS = async (tenantId, text, customer) => {
    if (!SMS_API_KEY || !PARTNER_ID || !SHORTCODE || !SMS_ENDPOINT) {
        throw new Error('Missing required SMS configuration environment variables');
    }
    try {
        const mobile = (0, exports.sanitizePhoneNumber)(customer.phoneNumber);
        if (!mobile) {
            throw new Error('Invalid phone number format');
        }
        // Prepare the payload to send the SMS
        const payload = {
            partnerID: PARTNER_ID,
            apikey: SMS_API_KEY,
            message: text,
            shortcode: SHORTCODE,
            mobile,
        };
        console.log(`Sending SMS to ${mobile} with payload: ${JSON.stringify(payload)}`);
        // Send the SMS
        const response = await axios_1.default.post(SMS_ENDPOINT, payload);
        // Log the SMS attempt in the database (optional, for auditing)
        return response.data;
    }
    catch (error) {
        console.error('Error sending SMS:', error);
        throw new Error('Failed to send SMS');
    }
};
exports.sendSMS = sendSMS;
// Function to sanitize phone numbers
const sanitizePhoneNumber = (phone) => {
    if (typeof phone !== 'string' || phone.trim() === '') {
        console.error('Invalid phone number format:', phone);
        return '';
    }
    if (phone.startsWith('+254')) {
        return phone.slice(1);
    }
    else if (phone.startsWith('0')) {
        return `254${phone.slice(1)}`;
    }
    else if (phone.startsWith('254')) {
        return phone;
    }
    else {
        return `254${phone}`;
    }
};
exports.sanitizePhoneNumber = sanitizePhoneNumber;
exports.default = { sendSMS: exports.sendSMS, sanitizePhoneNumber: exports.sanitizePhoneNumber };
