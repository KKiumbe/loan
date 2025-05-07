// src/utils/mpesaB2C.js
const axios = require('axios');
const { getMpesaAccessToken } = require('./token');

require('dotenv').config();

// Existing initiateB2CPayment function
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
      timeout: 30000,
    });
    console.timeEnd('mpesaB2CQuery');
    return response.data;
  } catch (error) {
    console.error('Error initiating B2C payment:', error.response?.data || error.message);
    throw new Error('Failed to initiate B2C payment');
  }
};

// New simplified disbursement function
const disburseB2CPayment = async ({ phoneNumber, amount }) => {
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }
  if (!phoneNumber.match(/^2547\d{8}$/)) {
    throw new Error('Invalid phone number format');
  }

  const resultUrl = `${process.env.APP_BASE_URL}/api/mpesa/b2c-result`;
  const queueTimeoutUrl = `${process.env.APP_BASE_URL}/api/mpesa/b2c-timeout`;

  console.time('mpesaPayment');
  const mpesaResponse = await initiateB2CPayment({
    amount,
    phoneNumber,
    queueTimeoutUrl,
    resultUrl,
    remarks: 'Loan disbursement',
  });
  console.timeEnd('mpesaPayment');

  return mpesaResponse;
};

module.exports = { initiateB2CPayment, disburseB2CPayment };