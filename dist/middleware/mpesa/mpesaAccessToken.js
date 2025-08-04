"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
// Daraja API credentials from environment variables
const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;
console.log(consumerKey);
console.log(consumerSecret);
// Function to generate an access token
const generateAccessToken = async () => {
    if (!consumerKey || !consumerSecret) {
        throw new Error('Consumer key or secret is not defined');
    }
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        const response = await (0, axios_1.default)({
            method: 'get',
            url: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
        });
        console.log(response.data);
        return response.data.access_token;
    }
    catch (error) {
        console.error('Error generating access token:', error.response ? error.response.data : error.message);
        throw error;
    }
};
exports.default = generateAccessToken;
