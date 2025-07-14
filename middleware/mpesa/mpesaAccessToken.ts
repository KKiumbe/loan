import axios from 'axios';

// Define interface for the expected response from the API
interface AccessTokenResponse {
  access_token: string;
  expires_in: string;
}

// Daraja API credentials from environment variables
const consumerKey: string | undefined = process.env.CONSUMER_KEY;
const consumerSecret: string | undefined = process.env.CONSUMER_SECRET;

console.log(consumerKey);
console.log(consumerSecret);

// Function to generate an access token
const generateAccessToken = async (): Promise<string> => {
  if (!consumerKey || !consumerSecret) {
    throw new Error('Consumer key or secret is not defined');
  }

  const auth: string = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios<AccessTokenResponse>({
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
  } catch (error: any) {
    console.error('Error generating access token:', error.response ? error.response.data : error.message);
    throw error;
  }
};

export default generateAccessToken;