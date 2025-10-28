// src/utils/mpesaAuth.ts
import axios from 'axios';
import 'dotenv/config';
import Redis from 'ioredis';
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not defined');
}
const redis = new Redis(redisUrl);
// Define interface for the expected response from the API
interface AccessTokenResponse {
  access_token: string;
  expires_in: string;
}





// Connect to Redis


// Key to store token
const TOKEN_KEY = 'mpesa_access_token';

const getMpesaAccessToken = async (consumerKey: string, consumerSecret: string): Promise<string> => {
  const oauthUrl = process.env.MPESA_OAUTH_URL;
  if (!consumerKey || !consumerSecret || !oauthUrl) {
    throw new Error('Missing M-Pesa OAuth configuration');
  }

  // Try to get token from Redis
  const cachedToken = await redis.get(TOKEN_KEY);
  if (cachedToken) return cachedToken;

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    console.time('mpesaOAuthQuery');
    const response = await axios.get<AccessTokenResponse>(oauthUrl, {
      headers: { Authorization: `Basic ${auth}` },
      params: { grant_type: 'client_credentials' },
      timeout: 10000,
    });
    console.timeEnd('mpesaOAuthQuery');

    const token = response.data.access_token;
    const expiresInSeconds = Number(response.data.expires_in);

    // Store token in Redis with expiry slightly less than actual
    await redis.set(TOKEN_KEY, token, 'EX', expiresInSeconds - 5);

    return token;
  } catch (error: any) {
    console.error('Error fetching M-Pesa access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch M-Pesa access token');
  }
};



export { getMpesaAccessToken };