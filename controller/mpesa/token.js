// src/utils/mpesaAuth.js
const axios = require('axios');
require('dotenv').config();

const getMpesaAccessToken = async () => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const oauthUrl = process.env.MPESA_OAUTH_URL;

  if (!consumerKey || !consumerSecret || !oauthUrl) {
    throw new Error('Missing M-Pesa configuration in environment variables');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    console.time('mpesaOAuthQuery');
    const response = await axios.get(oauthUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      timeout: 10000, // 10 seconds timeout
    });
    console.timeEnd('mpesaOAuthQuery');
    return response.data.access_token;
  } catch (error) {
    console.error('Error fetching M-Pesa access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch M-Pesa access token');
  }
};

module.exports = { getMpesaAccessToken };