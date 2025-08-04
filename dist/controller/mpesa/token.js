"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMpesaAccessToken = void 0;
// src/utils/mpesaAuth.ts
const axios_1 = __importDefault(require("axios"));
require("dotenv/config");
const getMpesaAccessToken = async (consumerKey, consumerSecret) => {
    const oauthUrl = process.env.MPESA_OAUTH_URL;
    console.log(`This is the oauthUrl: ${oauthUrl}`);
    if (!consumerKey || !consumerSecret || !oauthUrl) {
        throw new Error('Missing M-Pesa OAuth configuration');
    }
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    try {
        console.time('mpesaOAuthQuery');
        const response = await axios_1.default.get(oauthUrl, {
            headers: {
                Authorization: `Basic ${auth}`,
            },
            params: {
                grant_type: 'client_credentials',
            },
            timeout: 10000,
        });
        console.timeEnd('mpesaOAuthQuery');
        return response.data.access_token;
    }
    catch (error) {
        console.error('Error fetching M-Pesa access token:', error.response?.data || error.message);
        throw new Error('Failed to fetch M-Pesa access token');
    }
};
exports.getMpesaAccessToken = getMpesaAccessToken;
