const axios = require('axios');

// Daraja API credentials from environment variables
const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;

console.log(consumerKey);
console.log(consumerSecret);

// Function to generate an access token
const generateAccessToken = async () => {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64'); // Encode consumer key and secret

  try {
    const response = await axios({
      method: 'get',
      url: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded', // Safaricom expects this for OAuth requests
        'Accept': 'application/json',
      },
    });
    console.log(response.data);
    return response.data.access_token;
  
  } catch (error) {
    console.error('Error generating access token:', error.response ? error.response.data : error.message);
    throw error;
  }
};

module.exports = {
  generateAccessToken
};
