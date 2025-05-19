// src/utils/mpesaAuth.js
const axios = require('axios');
require('dotenv').config();

const getMpesaAccessToken = async (consumerKey, consumerSecret) => {
  const oauthUrl = process.env.MPESA_OAUTH_URL;
  console.log(`This is the oauthUrl: ${oauthUrl}`);
  if (!consumerKey || !consumerSecret || !oauthUrl) {
    throw new Error('Missing M-Pesa OAuth configuration');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    console.time('mpesaOAuthQuery');
    const response = await axios.get(oauthUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      params: {
        grant_type: 'client_credentials', // Add the required grant_type parameter
      },
      timeout: 10000,
    });
    console.timeEnd('mpesaOAuthQuery');
    return response.data.access_token;
  } catch (error) {
    console.error('Error fetching M-Pesa access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch M-Pesa access token');
  }
};

module.exports = { getMpesaAccessToken };