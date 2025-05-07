// src/utils/mpesaB2C.js
const axios = require('axios');
const { getMpesaAccessToken } = require('./mpesaAuth');
require('dotenv').config();

const initiateB2CPayment = async ({
  amount,
  phoneNumber,
  queueTimeoutUrl,
  resultUrl,
  remarks = 'Loan Disbursement',
}) => {
  const b2cUrl = process.env.MPESA_B2C_URL;
  const shortcode = process.env.MPESA_B2C_SHORTCODE;
  const initiatorName = process.env.MPESA_INITIATOR_NAME;
  const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;

  if (!b2cUrl || !shortcode || !initiatorName || !securityCredential) {
    throw new Error('Missing M-Pesa B2C configuration in environment variables');
  }

  // Validate inputs
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }
  if (!phoneNumber.match(/^2547\d{8}$/)) {
    throw new Error('Invalid phone number format');
  }
  if (!queueTimeoutUrl || !resultUrl) {
    throw new Error('Missing webhook URLs');
  }

  const accessToken = await getMpesaAccessToken();

  const payload = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment',
    Amount: amount,
    PartyA: shortcode,
    PartyB: phoneNumber,
    Remarks: remarks,
    QueueTimeOutURL: queueTimeoutUrl,
    ResultURL: resultUrl,
    Occasion: 'LoanDisbursement',
  };

  try {
    console.time('mpesaB2CQuery');
    const response = await axios.post(b2cUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
    });
    console.timeEnd('mpesaB2CQuery');
    return response.data;
  } catch (error) {
    console.error('Error initiating B2C payment:', error.response?.data || error.message);
    throw new Error('Failed to initiate B2C payment');
  }
};

module.exports = { initiateB2CPayment };