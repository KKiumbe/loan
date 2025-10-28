import axios from 'axios';
import 'dotenv/config';
import Redis from 'ioredis';

// 🧩 Initialize Redis
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not defined');
}
const redis = new Redis(redisUrl);

// 🔑 Redis key for token storage
const TOKEN_KEY = 'mpesa_access_token';

// 🧾 Interface for Safaricom OAuth response
interface AccessTokenResponse {
  access_token: string;
  expires_in: number; // Safaricom returns this as a number (e.g., 3599)
}

/**
 * Retrieves the M-Pesa access token.
 * - Checks Redis cache first.
 * - Fetches new token from Safaricom if not found or expired.
 * - Caches it with TTL just below actual expiry.
 */
 const getMpesaAccessToken = async (
  consumerKey: string,
  consumerSecret: string
): Promise<string> => {
  const oauthUrl = process.env.MPESA_OAUTH_URL;

  if (!consumerKey || !consumerSecret || !oauthUrl) {
    throw new Error('Missing M-Pesa OAuth configuration');
  }

  try {
    // 🧠 Try to fetch from Redis cache
    try {
      const cachedToken = await redis.get(TOKEN_KEY);
      if (cachedToken) {
        console.log('✅ Using cached M-Pesa access token');
        return cachedToken;
      }
    } catch (redisErr) {
      console.warn('⚠️ Redis unavailable, continuing without cache:', redisErr);
    }

    // 🔐 Prepare base64-encoded credentials
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    console.log('🔄 Fetching new M-Pesa access token...');
    console.time('mpesaOAuthQuery');

    // 🌍 Request new token from Safaricom
    const response = await axios.get<AccessTokenResponse>(oauthUrl, {
      headers: { Authorization: `Basic ${auth}` },
      params: { grant_type: 'client_credentials' },
      timeout: 10000, // 10 seconds
    });

    console.timeEnd('mpesaOAuthQuery');

    const token = response.data.access_token;
    const expiresInSeconds = response.data.expires_in;

    // 💾 Store in Redis (expire slightly before actual expiry)
    try {
      await redis.set(TOKEN_KEY, token, 'EX', expiresInSeconds - 5);
      console.log(`💾 Cached M-Pesa token for ${expiresInSeconds - 5} seconds`);
    } catch (redisErr) {
      console.warn('⚠️ Failed to store token in Redis:', redisErr);
    }

    return token;
  } catch (error: any) {
    console.error('❌ Error fetching M-Pesa access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch M-Pesa access token');
  }
};



export { getMpesaAccessToken };