const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // Initialize Prisma Client

// Load environment variables
const SMS_API_KEY = process.env.SMS_API_KEY;
const PARTNER_ID = process.env.PARTNER_ID;
const SHORTCODE = process.env.SHORTCODE;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;

// Function to send SMS with balance check
const sendSMS = async (text, customer) => {
  try {
    const mobile = customer.phoneNumber;
    
    // Prepare the payload to send the SMS
    const payload = {
      partnerID: PARTNER_ID,
      apikey: SMS_API_KEY,
      message: text,  // The message will be OTP or password reset code
      shortcode: SHORTCODE,
      mobile: sanitizePhoneNumber(mobile),
    };

    console.log(`Sending OTP to ${mobile} with payload: ${JSON.stringify(payload)}`);

    // Send the SMS
    const response = await axios.post(SMS_ENDPOINT, payload);

    // Return the response for further processing if needed
    return response.data;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send SMS');
  }
};

function sanitizePhoneNumber(phone) {
  if (typeof phone !== 'string') {
    console.error('Invalid phone number format:', phone);
    return '';
  }

  if (phone.startsWith('+254')) {
    return phone.slice(1);
  } else if (phone.startsWith('0')) {
    return `254${phone.slice(1)}`;
  } else if (phone.startsWith('254')) {
    return phone;
  } else {
    return `254${phone}`;
  }
}

module.exports = {
  sendSMS,
};
