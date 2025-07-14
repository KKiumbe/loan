// src/utils/mpesaAuth.ts
import axios from 'axios';
import 'dotenv/config';

// Define interface for the expected response from the API
interface AccessTokenResponse {
  access_token: string;
  expires_in: string;
}

const getMpesaAccessToken = async (consumerKey: string, consumerSecret: string): Promise<string> => {
  const oauthUrl: string | undefined = process.env.MPESA_OAUTH_URL;
  console.log(`This is the oauthUrl: ${oauthUrl}`);
  
  if (!consumerKey || !consumerSecret || !oauthUrl) {
    throw new Error('Missing M-Pesa OAuth configuration');
  }

  const auth: string = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    console.time('mpesaOAuthQuery');
    const response = await axios.get<AccessTokenResponse>(oauthUrl, {
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
  } catch (error: any) {
    console.error('Error fetching M-Pesa access token:', error.response?.data || error.message);
    throw new Error('Failed to fetch M-Pesa access token');
  }
};

export { getMpesaAccessToken };